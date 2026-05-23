package serla

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// receivedBatch captures the request body for a /api/v1/events/batch POST.
type receivedBatch struct {
	Events []struct {
		Name       string         `json:"name"`
		DistinctID string         `json:"distinctId"`
		Properties map[string]any `json:"properties"`
		Timestamp  string         `json:"timestamp"`
	} `json:"events"`
}

// testServer is a fake Serla ingest endpoint. It records every request and
// lets tests assert headers, bodies, and counts.
type testServer struct {
	t     *testing.T
	srv   *httptest.Server
	mu    sync.Mutex
	batch []receivedBatch
	ident []struct {
		DistinctID string         `json:"distinctId"`
		Properties map[string]any `json:"properties"`
	}
	headers       []http.Header
	identHeaders  []http.Header
	batchStatus   atomic.Int32 // override status code returned to /batch
	identStatus   atomic.Int32 // override status code returned to /identify
	batchHits     atomic.Int64
	identHits     atomic.Int64
	delayPerBatch time.Duration
}

func newTestServer(t *testing.T) *testServer {
	t.Helper()
	ts := &testServer{t: t}
	ts.batchStatus.Store(200)
	ts.identStatus.Store(200)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/events/batch", func(w http.ResponseWriter, r *http.Request) {
		ts.batchHits.Add(1)
		if ts.delayPerBatch > 0 {
			time.Sleep(ts.delayPerBatch)
		}
		body, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()
		var rb receivedBatch
		if err := json.Unmarshal(body, &rb); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		ts.mu.Lock()
		ts.batch = append(ts.batch, rb)
		ts.headers = append(ts.headers, r.Header.Clone())
		ts.mu.Unlock()

		code := int(ts.batchStatus.Load())
		w.WriteHeader(code)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/api/v1/identify", func(w http.ResponseWriter, r *http.Request) {
		ts.identHits.Add(1)
		body, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()
		var rb struct {
			DistinctID string         `json:"distinctId"`
			Properties map[string]any `json:"properties"`
		}
		if err := json.Unmarshal(body, &rb); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		ts.mu.Lock()
		ts.ident = append(ts.ident, rb)
		ts.identHeaders = append(ts.identHeaders, r.Header.Clone())
		ts.mu.Unlock()

		code := int(ts.identStatus.Load())
		w.WriteHeader(code)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	ts.srv = httptest.NewServer(mux)
	return ts
}

func (ts *testServer) Close() { ts.srv.Close() }

func (ts *testServer) URL() string { return ts.srv.URL }

// totalEvents returns the count across every recorded batch.
func (ts *testServer) totalEvents() int {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	n := 0
	for _, b := range ts.batch {
		n += len(b.Events)
	}
	return n
}

// allEvents returns the flattened recorded events in arrival order.
func (ts *testServer) allEvents() []receivedBatch {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	out := make([]receivedBatch, len(ts.batch))
	copy(out, ts.batch)
	return out
}

// silentLogger captures debug output for assertion.
type silentLogger struct {
	mu   sync.Mutex
	msgs []string
}

func (s *silentLogger) Printf(format string, args ...any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.msgs = append(s.msgs, fmt.Sprintf(format, args...))
}

func newClientFor(t *testing.T, ts *testServer, mod func(*Config)) *Client {
	t.Helper()
	cfg := Config{
		APIKey:        "sk_test_123",
		Host:          ts.URL(),
		FlushInterval: 25 * time.Millisecond,
		BatchSize:     3,
		Debug:         true,
		Logger:        &silentLogger{},
	}
	if mod != nil {
		mod(&cfg)
	}
	c, err := New(cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() {
		// Always shut down so worker goroutines don't leak between tests.
		ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		defer cancel()
		_ = c.Shutdown(ctx)
	})
	return c
}

func TestNew_RequiresAPIKey(t *testing.T) {
	t.Parallel()
	_, err := New(Config{})
	if err == nil {
		t.Fatal("expected error when APIKey is empty")
	}
	if !strings.Contains(err.Error(), "APIKey") {
		t.Errorf("error message should mention APIKey, got %q", err.Error())
	}
}

func TestNew_AppliesDefaults(t *testing.T) {
	t.Parallel()
	c, err := New(Config{APIKey: "sk_test"})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Shutdown(context.Background())
	if c.cfg.host != DefaultHost {
		t.Errorf("default host = %q, want %q", c.cfg.host, DefaultHost)
	}
	if c.cfg.batchSize != defaultBatchSize {
		t.Errorf("default batchSize = %d, want %d", c.cfg.batchSize, defaultBatchSize)
	}
	if c.cfg.flushInterval != defaultFlushInterval {
		t.Errorf("default flushInterval = %s, want %s", c.cfg.flushInterval, defaultFlushInterval)
	}
}

func TestNew_TrimsTrailingSlash(t *testing.T) {
	t.Parallel()
	c, err := New(Config{APIKey: "sk_test", Host: "https://example.com///"})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Shutdown(context.Background())
	if c.cfg.host != "https://example.com" {
		t.Errorf("host = %q, want trailing slash trimmed", c.cfg.host)
	}
}

func TestTrack_EnqueuesAndFlushes(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, nil)

	c.Track(Event{
		Name:       "signup_completed",
		DistinctID: "user_1",
		Properties: map[string]any{"plan": "pro"},
	})

	if err := c.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}

	if got := ts.totalEvents(); got != 1 {
		t.Fatalf("totalEvents = %d, want 1", got)
	}
	batches := ts.allEvents()
	ev := batches[0].Events[0]
	if ev.Name != "signup_completed" {
		t.Errorf("event name = %q", ev.Name)
	}
	if ev.DistinctID != "user_1" {
		t.Errorf("event distinctId = %q", ev.DistinctID)
	}
	if ev.Properties["plan"] != "pro" {
		t.Errorf("event property plan = %v", ev.Properties["plan"])
	}
	if ev.Timestamp == "" {
		t.Error("event timestamp is empty")
	}
}

func TestTrack_HeadersAuthAndIdempotency(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, nil)

	c.Track(Event{Name: "e1", DistinctID: "u"})
	if err := c.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}

	ts.mu.Lock()
	if len(ts.headers) == 0 {
		ts.mu.Unlock()
		t.Fatal("no requests recorded")
	}
	h := ts.headers[0]
	firstIdem := h.Get("X-Idempotency-Key")
	ts.mu.Unlock()

	if got := h.Get("Authorization"); got != "Bearer sk_test_123" {
		t.Errorf("Authorization = %q, want Bearer sk_test_123", got)
	}
	if got := h.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	if len(firstIdem) != 36 {
		t.Errorf("X-Idempotency-Key = %q (len %d), want 36-char UUID", firstIdem, len(firstIdem))
	}
	// Two flushes should produce two distinct idempotency keys.
	c.Track(Event{Name: "e2", DistinctID: "u"})
	if err := c.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}
	ts.mu.Lock()
	defer ts.mu.Unlock()
	if len(ts.headers) < 2 {
		t.Fatal("expected a second request")
	}
	if ts.headers[0].Get("X-Idempotency-Key") == ts.headers[1].Get("X-Idempotency-Key") {
		t.Error("idempotency keys should differ between flushes")
	}
}

func TestTrack_RequiresDistinctID(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	logger := &silentLogger{}
	c := newClientFor(t, ts, func(cfg *Config) { cfg.Logger = logger })

	c.Track(Event{Name: "no_user"})
	_ = c.Flush(context.Background())
	if got := ts.totalEvents(); got != 0 {
		t.Errorf("event without distinctId should be dropped, got %d events", got)
	}

	logger.mu.Lock()
	defer logger.mu.Unlock()
	found := false
	for _, m := range logger.msgs {
		if strings.Contains(m, "DistinctID") {
			found = true
		}
	}
	if !found {
		t.Errorf("expected warning about DistinctID, got %v", logger.msgs)
	}
}

func TestTrack_RequiresName(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, nil)

	c.Track(Event{DistinctID: "u"})
	_ = c.Flush(context.Background())
	if got := ts.totalEvents(); got != 0 {
		t.Errorf("event without Name should be dropped, got %d events", got)
	}
}

func TestTrack_BatchSizeTriggersFlush(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	// BatchSize=3, FlushInterval is large so size triggers the flush.
	c := newClientFor(t, ts, func(cfg *Config) {
		cfg.BatchSize = 3
		cfg.FlushInterval = 10 * time.Second
	})

	for i := 0; i < 3; i++ {
		c.Track(Event{Name: "e", DistinctID: "u", Properties: map[string]any{"i": i}})
	}

	// The size-triggered flush should fire without us calling Flush.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if ts.totalEvents() >= 3 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if got := ts.totalEvents(); got != 3 {
		t.Errorf("totalEvents = %d, want 3 (size-triggered flush)", got)
	}
}

func TestTrack_RetriesOn500(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	ts.batchStatus.Store(500)

	c := newClientFor(t, ts, func(cfg *Config) {
		cfg.FlushInterval = 10 * time.Second
	})

	c.Track(Event{Name: "e", DistinctID: "u"})
	// First flush attempt fails (server returns 500). Bounded ctx so Flush
	// doesn't try forever.
	flushCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	_ = c.Flush(flushCtx)
	cancel()

	hitsBeforeRecovery := ts.batchHits.Load()
	if hitsBeforeRecovery < 1 {
		t.Errorf("expected at least 1 batch hit during failures, got %d", hitsBeforeRecovery)
	}

	// The event should still be in the retry buffer.
	if got := c.PendingCount(); got == 0 {
		t.Errorf("expected event to be in pending after failures, got 0")
	}

	// Server recovers. The events that were re-queued should make it through.
	ts.batchStatus.Store(200)
	flushCtx2, cancel2 := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel2()
	if err := c.Flush(flushCtx2); err != nil {
		t.Fatalf("recovery Flush: %v", err)
	}

	// Server got at least one additional hit after the recovery point.
	if got := ts.batchHits.Load(); got <= hitsBeforeRecovery {
		t.Errorf("expected additional batch hits after recovery, got %d (was %d)",
			got, hitsBeforeRecovery)
	}
	// After recovery, the retry buffer should be empty (event was delivered
	// successfully on the recovery flush).
	if got := c.PendingCount(); got != 0 {
		t.Errorf("expected empty pending after recovery, got %d", got)
	}
}

func TestIdentify_PostsToIdentifyEndpoint(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, nil)

	err := c.Identify(context.Background(), "user_42", map[string]any{
		"email": "a@example.com",
		"plan":  "pro",
	})
	if err != nil {
		t.Fatalf("Identify: %v", err)
	}

	if ts.identHits.Load() != 1 {
		t.Errorf("identHits = %d, want 1", ts.identHits.Load())
	}
	ts.mu.Lock()
	defer ts.mu.Unlock()
	if len(ts.ident) != 1 {
		t.Fatalf("ident = %v, want 1 entry", ts.ident)
	}
	if ts.ident[0].DistinctID != "user_42" {
		t.Errorf("distinctId = %q", ts.ident[0].DistinctID)
	}
	if ts.ident[0].Properties["email"] != "a@example.com" {
		t.Errorf("properties.email = %v", ts.ident[0].Properties["email"])
	}

	// Auth header is set on Identify too.
	if got := ts.identHeaders[0].Get("Authorization"); got != "Bearer sk_test_123" {
		t.Errorf("Authorization = %q", got)
	}
}

func TestIdentify_RequiresDistinctID(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, nil)

	err := c.Identify(context.Background(), "", nil)
	if err == nil {
		t.Fatal("expected error from empty distinctId")
	}
	if ts.identHits.Load() != 0 {
		t.Errorf("empty distinctId should not hit server")
	}
}

func TestIdentify_HTTPErrorBubbles(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	ts.identStatus.Store(500)

	c := newClientFor(t, ts, nil)
	err := c.Identify(context.Background(), "u", nil)
	if err == nil {
		t.Fatal("expected error from HTTP 500")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("error should mention 500, got %v", err)
	}
}

func TestIdentify_ContextCancellation(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, nil)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before the call

	err := c.Identify(ctx, "u", nil)
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
}

func TestShutdown_IsIdempotent(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	cfg := Config{
		APIKey:        "sk_test_123",
		Host:          ts.URL(),
		FlushInterval: 50 * time.Millisecond,
	}
	c, err := New(cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if err := c.Shutdown(context.Background()); err != nil {
		t.Errorf("first Shutdown: %v", err)
	}
	if err := c.Shutdown(context.Background()); err != nil {
		t.Errorf("second Shutdown: %v", err)
	}
	if err := c.Shutdown(context.Background()); err != nil {
		t.Errorf("third Shutdown: %v", err)
	}
}

func TestShutdown_FlushesBeforeStopping(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()

	cfg := Config{
		APIKey:        "sk_test_123",
		Host:          ts.URL(),
		FlushInterval: 10 * time.Second, // won't tick during the test
	}
	c, err := New(cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	c.Track(Event{Name: "e", DistinctID: "u"})
	c.Track(Event{Name: "e", DistinctID: "u"})

	if err := c.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	// After shutdown the queue should have drained.
	if got := ts.totalEvents(); got != 2 {
		t.Errorf("totalEvents = %d, want 2 (drained by Shutdown)", got)
	}
}

func TestTrack_AfterShutdownIsNoOp(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	cfg := Config{
		APIKey:        "sk_test_123",
		Host:          ts.URL(),
		FlushInterval: 50 * time.Millisecond,
	}
	c, err := New(cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := c.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	c.Track(Event{Name: "post_shutdown", DistinctID: "u"})

	// Nothing should arrive at the server.
	time.Sleep(100 * time.Millisecond)
	if got := ts.totalEvents(); got != 0 {
		t.Errorf("expected 0 events after shutdown, got %d", got)
	}
}

func TestFlush_ContextCancellation(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	ts.batchStatus.Store(500) // every flush fails
	ts.delayPerBatch = 50 * time.Millisecond

	c := newClientFor(t, ts, func(cfg *Config) {
		cfg.FlushInterval = 10 * time.Second
	})

	c.Track(Event{Name: "e", DistinctID: "u"})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()

	err := c.Flush(ctx)
	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, context.Canceled) {
		t.Errorf("expected context error from Flush, got %v", err)
	}
}

func TestConcurrentTrack_RaceSafe(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, func(cfg *Config) {
		cfg.BatchSize = 25
		cfg.FlushInterval = 50 * time.Millisecond
	})

	const goroutines = 10
	const perGoroutine = 50
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for g := 0; g < goroutines; g++ {
		go func(g int) {
			defer wg.Done()
			for i := 0; i < perGoroutine; i++ {
				c.Track(Event{
					Name:       "concurrent",
					DistinctID: fmt.Sprintf("u_%d", g),
					Properties: map[string]any{"i": i},
				})
			}
		}(g)
	}
	wg.Wait()

	if err := c.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}
	if got, want := ts.totalEvents(), goroutines*perGoroutine; got != want {
		t.Errorf("totalEvents = %d, want %d", got, want)
	}
}

func TestPendingCount(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	ts.batchStatus.Store(500) // force events into pending

	c := newClientFor(t, ts, func(cfg *Config) {
		cfg.FlushInterval = 10 * time.Second
		cfg.BatchSize = 100
	})

	for i := 0; i < 5; i++ {
		c.Track(Event{Name: "e", DistinctID: "u"})
	}
	// Let worker pick up the events.
	time.Sleep(50 * time.Millisecond)
	// Force a failed flush so events land in retry buffer.
	flushCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	_ = c.Flush(flushCtx)
	cancel()

	if got := c.PendingCount(); got == 0 {
		t.Errorf("PendingCount = 0 after failed flush, want > 0")
	}
}

func TestTimestamp_DefaultsToNow(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, nil)

	before := time.Now().Add(-1 * time.Second)
	c.Track(Event{Name: "e", DistinctID: "u"})
	if err := c.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}
	after := time.Now().Add(1 * time.Second)

	batches := ts.allEvents()
	if len(batches) == 0 || len(batches[0].Events) == 0 {
		t.Fatal("no events recorded")
	}
	got := batches[0].Events[0].Timestamp
	parsed, err := time.Parse(time.RFC3339Nano, got)
	if err != nil {
		t.Fatalf("timestamp parse: %v (raw: %s)", err, got)
	}
	if parsed.Before(before) || parsed.After(after) {
		t.Errorf("timestamp %s not in [%s, %s]", parsed, before, after)
	}
}

func TestTimestamp_RespectsOverride(t *testing.T) {
	t.Parallel()
	ts := newTestServer(t)
	defer ts.Close()
	c := newClientFor(t, ts, nil)

	want := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
	c.Track(Event{Name: "e", DistinctID: "u", Timestamp: want})
	if err := c.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}
	batches := ts.allEvents()
	got := batches[0].Events[0].Timestamp
	parsed, err := time.Parse(time.RFC3339Nano, got)
	if err != nil {
		t.Fatalf("timestamp parse: %v", err)
	}
	if !parsed.Equal(want) {
		t.Errorf("timestamp = %s, want %s", parsed, want)
	}
}

func TestIdempotencyKey_UUIDFormat(t *testing.T) {
	t.Parallel()
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		k := generateIdempotencyKey()
		if len(k) != 36 {
			t.Fatalf("key %q has length %d, want 36", k, len(k))
		}
		if k[8] != '-' || k[13] != '-' || k[18] != '-' || k[23] != '-' {
			t.Fatalf("key %q missing UUID dashes", k)
		}
		// Version 4 marker at position 14
		if k[14] != '4' {
			t.Fatalf("key %q has version %c, want 4", k, k[14])
		}
		if seen[k] {
			t.Fatalf("collision on key %q after %d iterations", k, i)
		}
		seen[k] = true
	}
}

func TestComputeBackoff(t *testing.T) {
	t.Parallel()
	cases := []struct {
		failures int
		want     time.Duration
	}{
		{0, backoffInitial},
		{1, 1 * time.Second},
		{2, 2 * time.Second},
		{3, 4 * time.Second},
		{4, 8 * time.Second},
		{5, 16 * time.Second},
		{6, 30 * time.Second}, // capped
		{20, 30 * time.Second},
	}
	for _, tc := range cases {
		q := &queue{}
		q.consecutiveFailures = tc.failures
		got := q.computeBackoff()
		if got != tc.want {
			t.Errorf("failures=%d: backoff=%s, want %s", tc.failures, got, tc.want)
		}
	}
}
