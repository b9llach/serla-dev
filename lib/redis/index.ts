import Redis, { RedisOptions } from 'ioredis';

const redisUrl = process.env.REDIS_URL;

// Parse Redis URL using WHATWG URL API to avoid deprecation warning
function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

// Create Redis clients for pub/sub
// We need separate clients for publishing and subscribing
let publisherClient: Redis | null = null;
let subscriberClient: Redis | null = null;

export function getPublisher(): Redis | null {
  if (!redisUrl) return null;

  if (!publisherClient) {
    const options = parseRedisUrl(redisUrl);
    publisherClient = new Redis({
      ...options,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    publisherClient.on('error', (err) => {
      console.error('Redis publisher error:', err.message);
    });
  }

  return publisherClient;
}

export function getSubscriber(): Redis | null {
  if (!redisUrl) return null;

  if (!subscriberClient) {
    const options = parseRedisUrl(redisUrl);
    subscriberClient = new Redis({
      ...options,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    subscriberClient.on('error', (err) => {
      console.error('Redis subscriber error:', err.message);
    });
  }

  return subscriberClient;
}

export function createSubscriber(): Redis | null {
  if (!redisUrl) return null;

  const options = parseRedisUrl(redisUrl);
  const client = new Redis({
    ...options,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
  });

  client.on('error', (err) => {
    console.error('Redis subscriber error:', err.message);
  });

  return client;
}

// Channel name for project events
export function getProjectChannel(projectId: string): string {
  return `serla:events:${projectId}`;
}

// Publish an event to Redis
export async function publishEvent(projectId: string, event: unknown): Promise<void> {
  const publisher = getPublisher();
  if (!publisher) {
    console.log('[Redis] Not configured, skipping publish');
    return;
  }

  try {
    const channel = getProjectChannel(projectId);
    const result = await publisher.publish(channel, JSON.stringify(event));
    console.log(`[Redis] Published to ${channel}, ${result} subscribers received`);
  } catch (error) {
    console.error('[Redis] Failed to publish event:', error);
  }
}
