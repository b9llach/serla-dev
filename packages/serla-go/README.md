# serla-go

Official Go SDK for [Serla](https://serla.dev) - privacy-focused product analytics for developers.

- Zero runtime dependencies (stdlib only)
- Context-aware: `Identify`, `Flush`, and `Shutdown` accept `context.Context`
- Goroutine-safe: a single `Client` is shared across the program
- Channel-buffered ingest + background worker for batched delivery
- Exponential backoff and bounded retry buffer on flush failure
- Idempotency keys per batch so server-side dedup catches retried batches
- Drop-in for CLI tools, long-running servers, and serverless functions

## Install

```bash
go get github.com/b9llach/serla-go
```

Requires Go 1.21+.

## Quick start

```go
package main

import (
    "context"
    "log"
    "time"

    serla "github.com/b9llach/serla-go"
)

func main() {
    client, err := serla.New(serla.Config{
        APIKey:        "sk_live_...",
        Host:          "https://serla.dev",     // optional
        FlushInterval: 5 * time.Second,          // optional
        BatchSize:     50,                       // optional
        Debug:         false,                    // optional
    })
    if err != nil {
        log.Fatal(err)
    }
    defer client.Shutdown(context.Background())

    // Enqueue an event (non-blocking).
    client.Track(serla.Event{
        Name:       "signup_completed",
        DistinctID: "user_123",
        Properties: map[string]any{"plan": "pro"},
    })

    // Identify a user (synchronous - errors bubble up).
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := client.Identify(ctx, "user_123", map[string]any{
        "email": "a@example.com",
        "plan":  "pro",
    }); err != nil {
        log.Printf("identify: %v", err)
    }

    // Force a flush before a serverless function returns.
    _ = client.Flush(ctx)
}
```

## Configuration

| Field          | Type            | Default                | Description                                                                  |
| -------------- | --------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `APIKey`       | `string`        | (required)             | Your project API key (`sk_live_...`).                                        |
| `Host`         | `string`        | `https://serla.dev`    | Base URL of your Serla deployment. A trailing slash is trimmed.              |
| `BatchSize`    | `int`           | `50`                   | Max events per flushed batch. Reaching this size triggers an immediate flush.|
| `FlushInterval`| `time.Duration` | `5 * time.Second`      | Periodic flush cadence.                                                      |
| `ChannelBuffer`| `int`           | `1024`                 | Size of the producer-consumer channel. Producers block only when full.       |
| `Debug`        | `bool`          | `false`                | Log SDK activity via `Logger`.                                               |
| `Logger`       | `serla.Logger`  | stderr via `log.Logger`| Custom logger interface (`Printf(format string, args ...any)`).              |
| `HTTPClient`   | `*http.Client`  | `&http.Client{Timeout: 10s}` | Custom HTTP client - useful for proxies, retries, or mTLS.             |

## API

### `func New(cfg Config) (*Client, error)`

Construct a `Client` and start its background worker goroutine. Returns an error if `APIKey` is empty.

```go
client, err := serla.New(serla.Config{APIKey: "sk_live_..."})
```

### `func (c *Client) Track(event Event)`

Enqueue an event for asynchronous delivery. Returns immediately. The event is delivered on the next flush tick or sooner if the buffer reaches `BatchSize`.

```go
client.Track(serla.Event{
    Name:       "order_placed",
    DistinctID: "user_123",
    Properties: map[string]any{"totalCents": 4900, "currency": "USD"},
    // Timestamp is optional; defaults to time.Now() at enqueue time.
})
```

`DistinctID` is **required** - the server has no anonymous-id fallback. If you don't know the user yet, pass a stable system identifier (org ID, IP-derived ID, etc.).

### `func (c *Client) Identify(ctx context.Context, distinctID string, properties map[string]any) error`

Set user properties for a distinct ID. POSTs synchronously to `/api/v1/identify` and returns when the response arrives or `ctx` is cancelled.

```go
err := client.Identify(ctx, "user_123", map[string]any{
    "email":      "a@example.com",
    "plan":       "pro",
    "signedUpAt": time.Now().UTC().Format(time.RFC3339),
})
```

### `func (c *Client) Flush(ctx context.Context) error`

Force the worker to drain the event buffer. Blocks until the queue is empty or `ctx` is cancelled. Returns `ctx.Err()` on cancellation.

Call this before a serverless function returns so events aren't lost when the runtime freezes the process:

```go
defer client.Flush(ctx)
```

### `func (c *Client) Shutdown(ctx context.Context) error`

Graceful shutdown: drain the queue, stop the worker goroutine, release resources. Safe to call multiple times - subsequent calls are no-ops.

```go
defer client.Shutdown(context.Background())
```

### `func (c *Client) PendingCount() int`

Number of events currently buffered. Useful for tests and "are we caught up?" health checks.

## Examples

### HTTP server with graceful shutdown

```go
package main

import (
    "context"
    "log"
    "net/http"
    "os/signal"
    "syscall"
    "time"

    serla "github.com/b9llach/serla-go"
)

func main() {
    client, err := serla.New(serla.Config{APIKey: mustEnv("SERLA_API_KEY")})
    if err != nil {
        log.Fatal(err)
    }

    mux := http.NewServeMux()
    mux.HandleFunc("/signup", func(w http.ResponseWriter, r *http.Request) {
        client.Track(serla.Event{
            Name:       "signup_submitted",
            DistinctID: r.URL.Query().Get("user_id"),
        })
        w.WriteHeader(http.StatusOK)
    })

    srv := &http.Server{Addr: ":8080", Handler: mux}

    // Drain on SIGTERM / SIGINT.
    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
    defer stop()

    go func() {
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()

    <-ctx.Done()
    log.Println("shutting down...")

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    _ = srv.Shutdown(shutdownCtx)
    _ = client.Shutdown(shutdownCtx)
}
```

### Cobra CLI

```go
package main

import (
    "context"

    serla "github.com/b9llach/serla-go"
    "github.com/spf13/cobra"
)

func main() {
    client, err := serla.New(serla.Config{APIKey: "sk_live_..."})
    if err != nil {
        panic(err)
    }
    defer client.Shutdown(context.Background()) // drains before main returns

    root := &cobra.Command{
        Use: "myctl",
        Run: func(cmd *cobra.Command, args []string) {
            client.Track(serla.Event{
                Name:       "cli_command_run",
                DistinctID: detectUserID(),
                Properties: map[string]any{"command": cmd.Name()},
            })
        },
    }
    _ = root.Execute()
}

func detectUserID() string { return "anonymous-cli-user" }
```

### AWS Lambda (Go runtime)

```go
package main

import (
    "context"

    "github.com/aws/aws-lambda-go/lambda"
    serla "github.com/b9llach/serla-go"
)

// Package-level: reused across warm invocations.
var client *serla.Client

func init() {
    var err error
    client, err = serla.New(serla.Config{APIKey: mustEnv("SERLA_API_KEY")})
    if err != nil {
        panic(err)
    }
}

type Event struct{ UserID string }

func handler(ctx context.Context, e Event) error {
    client.Track(serla.Event{
        Name:       "lambda_invoked",
        DistinctID: e.UserID,
    })
    // CRITICAL: Lambda freezes the execution context when the handler
    // returns. Without this Flush, events queued during this invocation
    // sit in the buffer until the next invocation or get lost when the
    // container is recycled.
    return client.Flush(ctx)
}

func main() { lambda.Start(handler) }
```

### Goroutine fan-out

The channel buffer absorbs spikes - producers don't block until `ChannelBuffer` is full.

```go
client, _ := serla.New(serla.Config{
    APIKey:        "sk_live_...",
    ChannelBuffer: 10000, // sized for burst tolerance
    BatchSize:     200,
})
defer client.Shutdown(context.Background())

var wg sync.WaitGroup
for _, item := range work {
    wg.Add(1)
    go func(item Item) {
        defer wg.Done()
        process(item)
        client.Track(serla.Event{
            Name:       "item_processed",
            DistinctID: item.UserID,
            Properties: map[string]any{"item_id": item.ID},
        })
    }(item)
}
wg.Wait()
_ = client.Flush(context.Background())
```

## Reliability

- Events flow through a buffered channel into a single worker goroutine.
- The worker batches events and POSTs every `FlushInterval` or as soon as `BatchSize` is reached.
- Failed batches are re-queued at the front of an internal retry buffer (bounded at 1000 events to prevent unbounded memory growth).
- Failures trigger exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s. Successful flush resets the counter.
- Every batch carries an `X-Idempotency-Key` (v4 UUID) so server-side dedup can collapse retried-and-eventually-succeeded batches.
- The worker is stopped via `Shutdown`; further `Track` calls are no-ops.

## Comparison

| Concern           | serla-go                          | serla-node                       | serla-python              |
| ----------------- | --------------------------------- | -------------------------------- | ------------------------- |
| Concurrency       | Goroutine + channel               | Single-threaded event loop       | Background thread         |
| Identify          | `error`-returning, ctx-aware      | `Promise<void>`                  | Blocking                  |
| Flush trigger     | Channel send to worker            | `setInterval` + size threshold   | Daemon thread             |
| Cancellation      | `context.Context`                 | `Promise` race / `AbortSignal`   | Timeout argument          |
| Shutdown          | `Shutdown(ctx)` + `defer`         | `await shutdown()` + `beforeExit`| `atexit`                  |
| Anonymous ID      | Not supported (server-side)       | Not supported (server-side)      | Not supported             |
| Dependencies      | None (stdlib)                     | None (built-in `fetch`)          | `requests`                |

## License

MIT
