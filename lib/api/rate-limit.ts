// Redis-backed rate limiter for production with multiple instances
// Falls back to in-memory for development if Redis is not configured

import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

// Parse Redis URL
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

// Singleton Redis client for rate limiting
let rateLimitRedis: Redis | null = null;

function getRedisClient(): Redis | null {
  if (!redisUrl) return null;

  if (!rateLimitRedis) {
    const options = parseRedisUrl(redisUrl);
    rateLimitRedis = new Redis({
      ...options,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 2) return null; // Stop retrying
        return Math.min(times * 50, 200);
      },
    });

    rateLimitRedis.on('error', (err) => {
      console.error('Rate limit Redis error:', err.message);
    });
  }

  return rateLimitRedis;
}

// Fallback in-memory store for development
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const inMemoryStore = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10000; // Prevent unbounded growth

// Clean up expired entries periodically (only for in-memory fallback)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of inMemoryStore.entries()) {
      if (entry.resetAt < now) {
        inMemoryStore.delete(key);
      }
    }
    // If still too large, remove oldest entries
    if (inMemoryStore.size > MAX_STORE_SIZE) {
      const entriesToRemove = inMemoryStore.size - MAX_STORE_SIZE;
      const keys = Array.from(inMemoryStore.keys()).slice(0, entriesToRemove);
      keys.forEach(k => inMemoryStore.delete(k));
    }
  }, 60000);
}

interface RateLimitConfig {
  limit: number;       // Max requests
  windowMs: number;    // Time window in milliseconds
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// Lua script for atomic rate limiting
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local current = redis.call('GET', key)
local count = 0
local resetAt = now + window

if current then
  local data = cjson.decode(current)
  if data.resetAt > now then
    count = data.count
    resetAt = data.resetAt
  end
end

count = count + 1
local success = count <= limit
local remaining = math.max(0, limit - count)

redis.call('SET', key, cjson.encode({count = count, resetAt = resetAt}), 'PX', window)

return {success and 1 or 0, remaining, resetAt}
`;

async function rateLimitRedisImpl(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (!redis) {
    recordFallback('no-redis-configured');
    return rateLimitInMemory(identifier, config);
  }

  try {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();

    const result = await redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      config.limit,
      config.windowMs,
      now
    ) as [number, number, number];

    return {
      success: result[0] === 1,
      limit: config.limit,
      remaining: result[1],
      reset: result[2],
    };
  } catch (error) {
    console.error('Redis rate limit error, falling back to in-memory:', error);
    recordFallback('redis-error');
    return rateLimitInMemory(identifier, config);
  }
}

// Track how often we fall back to in-memory limiting; useful as a signal that
// Redis is misbehaving in production.
let fallbackInvocations = 0;
function recordFallback(reason: string) {
  fallbackInvocations++;
  if (fallbackInvocations % 100 === 1) {
    console.warn(`Rate limit using in-memory fallback (reason: ${reason}, count: ${fallbackInvocations}). Redis may be unhealthy.`);
  }
}

function rateLimitInMemory(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const key = identifier;

  let entry = inMemoryStore.get(key);

  // If no entry or window expired, create new entry
  if (!entry || entry.resetAt < now) {
    // Store full: deny rather than silently bypass the limiter.
    // This is the safe default - hitting this means many unique identifiers
    // are coming through and we cannot fairly track them all.
    if (inMemoryStore.size >= MAX_STORE_SIZE && !inMemoryStore.has(key)) {
      return {
        success: false,
        limit: config.limit,
        remaining: 0,
        reset: now + config.windowMs,
      };
    }
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    inMemoryStore.set(key, entry);
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      reset: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;

  // Check if over limit
  if (entry.count > config.limit) {
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      reset: entry.resetAt,
    };
  }

  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - entry.count,
    reset: entry.resetAt,
  };
}

export async function rateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  return rateLimitRedisImpl(identifier, config);
}

// Synchronous version for backwards compatibility (uses in-memory only)
export function rateLimitSync(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  return rateLimitInMemory(identifier, config);
}

// Pre-configured rate limiters for different endpoints
export const rateLimits = {
  // Event ingestion: 1000 requests per minute per API key
  events: { limit: 1000, windowMs: 60 * 1000 },

  // Batch ingestion: 100 requests per minute per API key
  batchEvents: { limit: 100, windowMs: 60 * 1000 },

  // Export: 10 requests per minute per API key
  export: { limit: 10, windowMs: 60 * 1000 },

  // Auth endpoints: 10 requests per minute per IP
  auth: { limit: 10, windowMs: 60 * 1000 },

  // Password reset: 5 requests per hour per IP
  passwordReset: { limit: 5, windowMs: 60 * 60 * 1000 },
};

// Helper to create rate limit response
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.toString(),
        'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
      },
    }
  );
}

// Helper to add rate limit headers to successful response
export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult
): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-RateLimit-Limit', result.limit.toString());
  newHeaders.set('X-RateLimit-Remaining', result.remaining.toString());
  newHeaders.set('X-RateLimit-Reset', result.reset.toString());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
