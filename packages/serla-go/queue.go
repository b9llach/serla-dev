package serla

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// Maximum number of events to keep in the retry buffer when flushes are
// failing. Prevents unbounded memory growth if the endpoint stays down.
const maxRetryBufferSize = 1000

// Backoff parameters: 1s, 2s, 4s, 8s, 16s, capped at 30s.
const (
	backoffInitial = 1 * time.Second
	backoffMax     = 30 * time.Second
)

// queue owns the producer-consumer pipeline:
//   - producers push events to events (buffered chan)
//   - the worker goroutine reads from events, batches them, and POSTs to
//     /api/v1/events/batch
//   - failed batches are re-queued into pending (the retry buffer, guarded
//     by mu) and retried after exponential backoff
//   - flushReq is a request channel used by Flush/Shutdown to ask the worker
//     to drain everything and signal back via a per-request done channel
type queue struct {
	cfg resolvedConfig

	events   chan queuedEvent
	flushReq chan flushRequest
	stopReq  chan struct{}
	stopped  chan struct{}

	mu                  sync.Mutex
	pending             []queuedEvent // retry buffer (re-queued after failure)
	consecutiveFailures int
}

// flushRequest is sent to the worker to demand a drain. done is closed when
// the worker either drains the queue successfully, gives up due to backoff,
// or detects ctx cancellation.
type flushRequest struct {
	ctx  context.Context
	done chan struct{}
}

func newQueue(cfg resolvedConfig) *queue {
	return &queue{
		cfg:      cfg,
		events:   make(chan queuedEvent, cfg.channelBuffer),
		flushReq: make(chan flushRequest),
		stopReq:  make(chan struct{}),
		stopped:  make(chan struct{}),
	}
}

func (q *queue) start() {
	go q.run()
}

// enqueue is called by Client.Track. Blocks only if the channel buffer is
// full (back-pressure on producers).
func (q *queue) enqueue(e queuedEvent) {
	// Use a select with a done check so we don't block forever if shutdown
	// happens while a producer is blocked on a full channel.
	select {
	case q.events <- e:
	case <-q.stopReq:
		// Worker is shutting down; drop the event rather than blocking
		// the producer. Client.Track guards on c.closed before reaching
		// here, so this is just a belt-and-suspenders fallback.
	}
}

// run is the worker goroutine. Reads events, batches them, flushes on tick
// or when batchSize is reached, and services Flush/Shutdown requests.
func (q *queue) run() {
	defer close(q.stopped)

	ticker := time.NewTicker(q.cfg.flushInterval)
	defer ticker.Stop()

	// batch is the worker-local pending events not yet sent.
	var batch []queuedEvent

	// nextFlushAt is the earliest wall-clock time we may attempt a network
	// flush again, set after a failure. flushes before this time are
	// deferred (events still accumulate in batch / pending).
	var nextFlushAt time.Time

	tryFlush := func(ctx context.Context, force bool) {
		// Pull any re-queued events to the front of the batch.
		q.mu.Lock()
		if len(q.pending) > 0 {
			batch = append(q.pending, batch...)
			q.pending = nil
		}
		q.mu.Unlock()

		if len(batch) == 0 {
			return
		}
		if !force && time.Now().Before(nextFlushAt) {
			return
		}

		// Send up to batchSize * 10 events in a single request, so a big
		// burst doesn't get throttled to one batch per tick.
		sendLimit := q.cfg.batchSize * 10
		if len(batch) < sendLimit {
			sendLimit = len(batch)
		}
		toSend := batch[:sendLimit]
		remaining := batch[sendLimit:]

		err := q.postBatch(ctx, toSend)
		if err != nil {
			q.handleFailure(toSend, err)
			// keep remaining locally; pending now holds the failed batch
			batch = remaining
			nextFlushAt = time.Now().Add(q.computeBackoff())
			return
		}

		// Success path
		q.mu.Lock()
		q.consecutiveFailures = 0
		q.mu.Unlock()
		nextFlushAt = time.Time{}
		batch = remaining
		if q.cfg.debug {
			q.cfg.logger.Printf("[serla] flushed %d event(s)", len(toSend))
		}
	}

	for {
		select {
		case <-q.stopReq:
			// Final drain attempt on shutdown, but don't loop forever.
			tryFlush(context.Background(), true)
			return

		case e := <-q.events:
			batch = append(batch, e)
			if len(batch) >= q.cfg.batchSize {
				tryFlush(context.Background(), false)
			}

		case <-ticker.C:
			tryFlush(context.Background(), false)

		case req := <-q.flushReq:
			// Drain everything in the inbound channel first so Flush
			// captures events that producers had already started enqueuing
			// when Flush was called.
		drainInbound:
			for {
				select {
				case e := <-q.events:
					batch = append(batch, e)
				default:
					break drainInbound
				}
			}

			// Try repeatedly to clear the local batch + retry buffer.
			// Bound the attempts so a permanently-broken endpoint doesn't
			// deadlock Flush.
			ctxCancelled := false
			for attempts := 0; attempts < 5; attempts++ {
				// Honor caller's ctx cancellation
				if req.ctx != nil {
					select {
					case <-req.ctx.Done():
						ctxCancelled = true
					default:
					}
				}
				if ctxCancelled {
					break
				}

				q.mu.Lock()
				hasPending := len(q.pending) > 0
				q.mu.Unlock()
				if len(batch) == 0 && !hasPending {
					break
				}
				// Force a flush regardless of backoff during explicit drain.
				nextFlushAt = time.Time{}
				tryFlush(req.ctx, true)
			}
			close(req.done)
		}
	}
}

// handleFailure re-queues a failed batch into pending, bounded by
// maxRetryBufferSize. Increments consecutiveFailures so the next flush
// honors exponential backoff.
func (q *queue) handleFailure(batch []queuedEvent, reason error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.consecutiveFailures++
	// Keep at most maxRetryBufferSize events total in pending. Newer events
	// (from batch) are prioritized over older ones already in pending so
	// the queue eventually drains the most recent activity if the endpoint
	// stays down.
	combined := append(q.pending, batch...)
	if len(combined) > maxRetryBufferSize {
		combined = combined[len(combined)-maxRetryBufferSize:]
	}
	q.pending = combined
	if q.cfg.debug {
		backoff := q.computeBackoffLocked()
		q.cfg.logger.Printf("[serla] flush failed (%v), retry in %s, %d events queued",
			reason, backoff, len(q.pending))
	}
}

// computeBackoff returns the current backoff duration based on
// consecutiveFailures. 1s, 2s, 4s, 8s, 16s, max 30s.
func (q *queue) computeBackoff() time.Duration {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.computeBackoffLocked()
}

// computeBackoffLocked is the bare math, assumes q.mu is held.
func (q *queue) computeBackoffLocked() time.Duration {
	if q.consecutiveFailures <= 0 {
		return backoffInitial
	}
	// 1 << (n-1) saturates fast; cap at backoffMax.
	shift := q.consecutiveFailures - 1
	if shift > 10 {
		return backoffMax
	}
	d := backoffInitial * (1 << shift)
	if d > backoffMax {
		return backoffMax
	}
	return d
}

// postBatch issues a POST /api/v1/events/batch with an Idempotency-Key.
// Returns nil on 2xx; an error on network failure or non-2xx response.
func (q *queue) postBatch(ctx context.Context, batch []queuedEvent) error {
	body, err := json.Marshal(struct {
		Events []queuedEvent `json:"events"`
	}{Events: batch})
	if err != nil {
		return fmt.Errorf("marshal batch: %w", err)
	}

	if ctx == nil {
		ctx = context.Background()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		q.cfg.host+"/api/v1/events/batch", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+q.cfg.apiKey)
	req.Header.Set("X-Idempotency-Key", generateIdempotencyKey())

	res, err := q.cfg.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", res.StatusCode)
	}
	return nil
}

// drain asks the worker to flush everything and waits for completion or ctx
// cancellation. Returns ctx.Err() if cancelled.
func (q *queue) drain(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	// If the worker is already stopped, there's nothing to drain.
	select {
	case <-q.stopped:
		return nil
	default:
	}

	done := make(chan struct{})
	req := flushRequest{ctx: ctx, done: done}

	select {
	case q.flushReq <- req:
	case <-q.stopped:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// shutdown drains (best-effort, bounded by ctx) then stops the worker.
func (q *queue) shutdown(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	// Best-effort drain; capture any ctx cancellation.
	drainErr := q.drain(ctx)

	// Tell the worker to stop. Idempotent via select-default in case it's
	// already shut down.
	select {
	case <-q.stopReq:
		// already closed
	default:
		close(q.stopReq)
	}

	// Wait for the worker to fully exit. Worker exits promptly on stopReq.
	<-q.stopped
	return drainErr
}

// pendingCount returns events buffered in the channel plus events sitting
// in the retry buffer. Doesn't see events the worker is currently holding
// in its local batch slice (transient).
func (q *queue) pendingCount() int {
	q.mu.Lock()
	pending := len(q.pending)
	q.mu.Unlock()
	return pending + len(q.events)
}

// generateIdempotencyKey returns a v4-style UUID string. Uses crypto/rand
// so collisions across processes are astronomically unlikely.
func generateIdempotencyKey() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Fall back to a time-based key if the system has no entropy.
		// This should be essentially impossible on modern OSes.
		return fmt.Sprintf("ts-%d", time.Now().UnixNano())
	}
	// Set version (4) and variant (RFC 4122) bits.
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	var dst [36]byte
	hex.Encode(dst[0:8], b[0:4])
	dst[8] = '-'
	hex.Encode(dst[9:13], b[4:6])
	dst[13] = '-'
	hex.Encode(dst[14:18], b[6:8])
	dst[18] = '-'
	hex.Encode(dst[19:23], b[8:10])
	dst[23] = '-'
	hex.Encode(dst[24:36], b[10:16])
	return string(dst[:])
}

// defaultLogger writes to stderr via the stdlib log package. Used when
// Config.Logger is nil.
type defaultLogger struct{}

var stderrLogger = log.New(os.Stderr, "", log.LstdFlags)

func (defaultLogger) Printf(format string, args ...any) {
	stderrLogger.Printf(format, args...)
}
