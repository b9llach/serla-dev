// Package serla is the official Go SDK for Serla analytics
// (https://serla.dev) - privacy-focused product analytics for developers.
//
// The SDK is zero-dependency (stdlib only), context-aware, and safe to share
// across goroutines. A single [Client] is intended to be constructed once per
// process and reused for the lifetime of the program.
//
//	client, err := serla.New(serla.Config{APIKey: "sk_live_..."})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer client.Shutdown(context.Background())
//
//	client.Track(serla.Event{
//	    Name:       "signup_completed",
//	    DistinctID: "user_123",
//	    Properties: map[string]any{"plan": "pro"},
//	})
//
// Events are buffered in memory and flushed in the background by a worker
// goroutine. Call [Client.Flush] before a serverless function returns so the
// runtime doesn't freeze the process with events still pending, and call
// [Client.Shutdown] at process exit for long-lived programs.
package serla

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// DefaultHost is the production Serla ingest endpoint.
const DefaultHost = "https://serla.dev"

// Default tunables. Override via [Config].
const (
	defaultBatchSize     = 50
	defaultFlushInterval = 5 * time.Second
	defaultChannelBuffer = 1024
	defaultHTTPTimeout   = 10 * time.Second
)

// Config configures a [Client]. APIKey is required; everything else has a
// reasonable default.
type Config struct {
	// APIKey is the project API key, e.g. "sk_live_...". Required.
	APIKey string

	// Host is the base URL of your Serla deployment. Defaults to
	// [DefaultHost] ("https://serla.dev"). A trailing slash is trimmed.
	Host string

	// FlushInterval is the periodic flush cadence. Defaults to 5s.
	FlushInterval time.Duration

	// BatchSize is the max events per flushed batch. When the buffer reaches
	// this size a flush is triggered immediately rather than waiting for the
	// next tick. Defaults to 50.
	BatchSize int

	// ChannelBuffer is the size of the underlying event channel. Producers
	// (callers of Track) block only if this buffer is full. Defaults to 1024.
	ChannelBuffer int

	// Debug toggles SDK logging via the [Logger]. Defaults to false.
	Debug bool

	// Logger is used to print debug/warning messages when Debug is true.
	// Defaults to a logger writing to stderr.
	Logger Logger

	// HTTPClient is the HTTP client used to talk to the Serla API. If nil,
	// a client with a 10s timeout is constructed. Provide your own for
	// custom transports (e.g. retry middleware, proxies, mTLS).
	HTTPClient *http.Client
}

// Logger is a minimal logging surface. Pass a custom implementation via
// [Config.Logger] to integrate with structured loggers (zap, zerolog, slog).
type Logger interface {
	Printf(format string, args ...any)
}

// Event is the payload accepted by [Client.Track].
//
// Name and DistinctID are required. Properties is optional. Timestamp
// defaults to time.Now() at enqueue time when zero.
type Event struct {
	// Name is the event name, e.g. "signup_completed". Required.
	Name string

	// DistinctID identifies the user this event is attributed to. Required -
	// the server has no anonymous-id fallback. Use a stable system identifier
	// (org ID, IP-derived ID, etc.) when the user isn't known yet.
	DistinctID string

	// Properties is an arbitrary map of event properties. The reserved
	// "$groups" key is supported for group analytics, e.g.
	// {"$groups": map[string]any{"team": "team_42"}}.
	Properties map[string]any

	// Timestamp overrides the event timestamp. Defaults to time.Now() at
	// enqueue time when zero.
	Timestamp time.Time
}

// queuedEvent is the wire-shape of an event. timestamp is serialized as
// RFC3339 (ISO 8601) so it lines up with the JS/Python SDKs.
type queuedEvent struct {
	Name       string         `json:"name"`
	DistinctID string         `json:"distinctId"`
	Properties map[string]any `json:"properties"`
	Timestamp  string         `json:"timestamp"`
}

// Client is the Serla SDK client. Safe for concurrent use by multiple
// goroutines. Construct with [New], shut down with [Client.Shutdown].
type Client struct {
	cfg    resolvedConfig
	queue  *queue
	closed chan struct{}
	once   sync.Once
}

// resolvedConfig is the validated, default-applied snapshot of [Config].
type resolvedConfig struct {
	apiKey        string
	host          string
	flushInterval time.Duration
	batchSize     int
	channelBuffer int
	debug         bool
	logger        Logger
	httpClient    *http.Client
}

// New constructs a [Client] and starts its background worker goroutine.
//
// Returns an error if APIKey is empty. The caller is responsible for calling
// [Client.Shutdown] at process exit; defer it immediately after construction:
//
//	client, err := serla.New(serla.Config{APIKey: key})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer client.Shutdown(context.Background())
func New(cfg Config) (*Client, error) {
	if cfg.APIKey == "" {
		return nil, errors.New("serla: APIKey is required")
	}

	host := cfg.Host
	if host == "" {
		host = DefaultHost
	}
	// Trim a single trailing slash so request URLs don't double-slash.
	for len(host) > 0 && host[len(host)-1] == '/' {
		host = host[:len(host)-1]
	}

	flushInterval := cfg.FlushInterval
	if flushInterval <= 0 {
		flushInterval = defaultFlushInterval
	}
	batchSize := cfg.BatchSize
	if batchSize <= 0 {
		batchSize = defaultBatchSize
	}
	channelBuffer := cfg.ChannelBuffer
	if channelBuffer <= 0 {
		channelBuffer = defaultChannelBuffer
	}
	logger := cfg.Logger
	if logger == nil {
		logger = defaultLogger{}
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultHTTPTimeout}
	}

	rc := resolvedConfig{
		apiKey:        cfg.APIKey,
		host:          host,
		flushInterval: flushInterval,
		batchSize:     batchSize,
		channelBuffer: channelBuffer,
		debug:         cfg.Debug,
		logger:        logger,
		httpClient:    httpClient,
	}

	c := &Client{
		cfg:    rc,
		closed: make(chan struct{}),
	}
	c.queue = newQueue(rc)
	c.queue.start()

	if rc.debug {
		rc.logger.Printf("[serla] initialized host=%s batchSize=%d flushInterval=%s",
			rc.host, rc.batchSize, rc.flushInterval)
	}
	return c, nil
}

// Track enqueues an event for asynchronous delivery. Returns immediately.
//
// The event is delivered on the next flush tick (every FlushInterval) or
// sooner if the buffer reaches BatchSize. Track is non-blocking unless the
// underlying channel buffer is full, in which case the caller waits for the
// worker to make progress.
//
// If the client has been shut down, Track is a no-op (and logs a warning
// when Debug is enabled). If Name or DistinctID is empty, the event is
// dropped with a warning.
func (c *Client) Track(event Event) {
	select {
	case <-c.closed:
		if c.cfg.debug {
			c.cfg.logger.Printf("[serla] track() after shutdown - ignoring (name=%s)", event.Name)
		}
		return
	default:
	}

	if event.Name == "" {
		if c.cfg.debug {
			c.cfg.logger.Printf("[serla] track() requires Name")
		}
		return
	}
	if event.DistinctID == "" {
		if c.cfg.debug {
			c.cfg.logger.Printf("[serla] track() requires DistinctID (server-side has no anonymous-id fallback)")
		}
		return
	}

	ts := event.Timestamp
	if ts.IsZero() {
		ts = time.Now()
	}
	props := event.Properties
	if props == nil {
		props = map[string]any{}
	}

	c.queue.enqueue(queuedEvent{
		Name:       event.Name,
		DistinctID: event.DistinctID,
		Properties: props,
		Timestamp:  ts.UTC().Format(time.RFC3339Nano),
	})

	if c.cfg.debug {
		c.cfg.logger.Printf("[serla] track name=%s distinctId=%s", event.Name, event.DistinctID)
	}
}

// Identify associates a distinct ID with user properties. Blocks until the
// HTTP request completes or ctx is cancelled.
//
// Unlike [Client.Track], Identify is synchronous so callers can gate
// user-creation flows on its success. Returns the HTTP/network error on
// failure.
func (c *Client) Identify(ctx context.Context, distinctID string, properties map[string]any) error {
	select {
	case <-c.closed:
		return errors.New("serla: identify called after shutdown")
	default:
	}
	if distinctID == "" {
		return errors.New("serla: identify requires a distinctId")
	}
	if properties == nil {
		properties = map[string]any{}
	}

	body, err := json.Marshal(struct {
		DistinctID string         `json:"distinctId"`
		Properties map[string]any `json:"properties"`
	}{
		DistinctID: distinctID,
		Properties: properties,
	})
	if err != nil {
		return fmt.Errorf("serla: marshal identify body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.cfg.host+"/api/v1/identify", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("serla: build identify request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.cfg.apiKey)

	res, err := c.cfg.httpClient.Do(req)
	if err != nil {
		if c.cfg.debug {
			c.cfg.logger.Printf("[serla] identify failed: %v", err)
		}
		return fmt.Errorf("serla: identify request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		if c.cfg.debug {
			c.cfg.logger.Printf("[serla] identify HTTP %d", res.StatusCode)
		}
		return fmt.Errorf("serla: identify HTTP %d", res.StatusCode)
	}
	if c.cfg.debug {
		c.cfg.logger.Printf("[serla] identify distinctId=%s", distinctID)
	}
	return nil
}

// Flush forces the worker to drain the event buffer. Blocks until the queue
// is empty, ctx is cancelled, or the in-flight request fails terminally
// (events failing flush are re-queued, not surfaced as errors).
//
// Call Flush before a serverless function returns so events aren't lost when
// the runtime freezes the process:
//
//	defer client.Flush(ctx)
func (c *Client) Flush(ctx context.Context) error {
	return c.queue.drain(ctx)
}

// Shutdown gracefully stops the client: drains the queue, stops the worker
// goroutine, and releases resources. Safe to call multiple times - subsequent
// calls return nil immediately.
//
// ctx bounds the drain phase. If ctx is cancelled before the queue empties,
// any remaining events are dropped and the corresponding ctx error is
// returned. The worker goroutine is always stopped regardless of ctx.
func (c *Client) Shutdown(ctx context.Context) error {
	var err error
	c.once.Do(func() {
		close(c.closed)
		err = c.queue.shutdown(ctx)
		if c.cfg.debug {
			c.cfg.logger.Printf("[serla] shutdown complete")
		}
	})
	return err
}

// PendingCount returns the number of events currently buffered (either in
// the channel or the worker's batch slice). Useful for tests and health
// checks.
func (c *Client) PendingCount() int {
	return c.queue.pendingCount()
}
