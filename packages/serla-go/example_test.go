package serla_test

import (
	"context"
	"log"
	"time"

	serla "github.com/b9llach/serla-go"
)

func ExampleNew() {
	client, err := serla.New(serla.Config{
		APIKey: "sk_live_example",
	})
	if err != nil {
		log.Fatal(err)
	}
	defer client.Shutdown(context.Background())

	client.Track(serla.Event{
		Name:       "signup_completed",
		DistinctID: "user_123",
		Properties: map[string]any{"plan": "pro"},
	})
}

func ExampleClient_Track() {
	client, _ := serla.New(serla.Config{APIKey: "sk_live_example"})
	defer client.Shutdown(context.Background())

	client.Track(serla.Event{
		Name:       "order_placed",
		DistinctID: "user_42",
		Properties: map[string]any{
			"totalCents": 4900,
			"currency":   "USD",
		},
	})
}

func ExampleClient_Identify() {
	client, _ := serla.New(serla.Config{APIKey: "sk_live_example"})
	defer client.Shutdown(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Identify(ctx, "user_123", map[string]any{
		"email": "a@example.com",
		"plan":  "pro",
	}); err != nil {
		log.Printf("identify failed: %v", err)
	}
}

func ExampleClient_Flush() {
	client, _ := serla.New(serla.Config{APIKey: "sk_live_example"})
	defer client.Shutdown(context.Background())

	client.Track(serla.Event{Name: "page_view", DistinctID: "u"})

	// Before a serverless function returns, force the worker to flush
	// so events aren't lost when the runtime freezes the process.
	flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Flush(flushCtx); err != nil {
		log.Printf("flush: %v", err)
	}
}

// ExampleClient_Shutdown demonstrates the graceful-shutdown pattern for a
// long-lived server. Pair this with signal.NotifyContext to drain the queue
// when SIGTERM arrives.
func ExampleClient_Shutdown() {
	client, _ := serla.New(serla.Config{
		APIKey:        "sk_live_example",
		FlushInterval: 5 * time.Second,
		BatchSize:     50,
	})

	// ... use the client throughout the program ...
	client.Track(serla.Event{Name: "request_handled", DistinctID: "u"})

	// On shutdown:
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := client.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
