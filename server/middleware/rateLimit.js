// Small single-process limiter; use a shared store (e.g. Redis) before horizontal scaling.
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 300, message = 'Too many requests. Please try again later.', keyGenerator } = {}) {
  const buckets = new Map();
  let lastCleanup = Date.now();
  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (now - lastCleanup > windowMs) {
      for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
      lastCleanup = now;
    }
    const key = keyGenerator ? keyGenerator(req) : String(req.ip || req.socket?.remoteAddress || 'unknown');
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) return res.status(429).json({ error: { code: 'RATE_LIMITED', message }, requestId: req.requestId || null });
    return next();
  };
}
module.exports = { createRateLimiter };
