// Best-effort per-user rate limiter for the AI-backed serverless endpoints.
//
// IMPORTANT: this is an in-memory sliding window scoped to a single warm
// serverless instance. It is NOT a distributed limiter — a determined attacker
// who forces many cold starts can exceed the nominal limit, and the counters
// reset whenever the instance is recycled. It exists to stop a single
// authenticated user from trivially burning the Anthropic credit balance in a
// tight loop; the JWT requirement is the primary control. If we need a hard,
// shared guarantee later, back this with a Postgres counter or Upstash/Redis.

const buckets = new Map(); // key -> number[] of request timestamps (ms)

/**
 * @param {string} key   Stable identity for the caller (e.g. `voice:<userId>`).
 * @param {{ limit?: number, windowMs?: number }} opts
 * @returns {{ allowed: boolean, retryAfterSec?: number }}
 */
export function checkRateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  buckets.set(key, recent);

  // Opportunistic cleanup so the map can't grow unbounded across many users.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  return { allowed: true };
}
