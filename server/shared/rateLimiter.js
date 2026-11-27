const { redisClient, isRedisConnected } = require('./redis');

const memoryBuckets = new Map();

// Periodically prune expired in-memory rate limit entries
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of memoryBuckets.entries()) {
    if (bucket.resetAt <= now) {
      memoryBuckets.delete(key);
    }
  }
}, 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

async function consumeRateLimit(key, windowMs, maxRequests) {
  const now = Date.now();
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  if (isRedisConnected() && redisClient) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redisClient.incr(redisKey);
      if (count === 1) {
        await redisClient.expire(redisKey, windowSec);
      }
      const ttl = await redisClient.ttl(redisKey);
      const resetInSec = ttl > 0 ? ttl : windowSec;
      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - count),
        retryAfterSec: resetInSec,
      };
    } catch {
      // Fall through to in-memory limiter
    }
  }

  let bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    memoryBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function createRateLimiter({
  keyPrefix,
  windowMs = 15 * 60 * 1000,
  maxRequests = 10,
  message = 'Too many requests. Please try again later.',
  keyGenerator,
}) {
  return async (req, res, next) => {
    try {
      const rawKey = keyGenerator ? keyGenerator(req) : (req.ip || 'unknown');
      const result = await consumeRateLimit(`${keyPrefix}:${rawKey}`, windowMs, maxRequests);

      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));

      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSec));
        return res.status(429).json({ error: message });
      }
      return next();
    } catch {
      return next();
    }
  };
}

module.exports = {
  createRateLimiter,
  consumeRateLimit,
};
