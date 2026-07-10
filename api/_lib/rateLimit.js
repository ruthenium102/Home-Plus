// Per-user rate limiter for the AI-backed serverless endpoints (S4).
//
// Two layers:
//  1. In-memory sliding window (fast path) — scoped to a single warm instance,
//     catches tight loops without a DB round-trip.
//  2. Shared Postgres fixed window via the check_rate_limit() SECURITY DEFINER
//     RPC (migrate_v29) — the distributed backstop that holds across cold
//     starts and multiple instances.
// If the RPC is unreachable we fall back to layer 1 alone (fail-open on the
// distributed layer; the JWT + membership gate remains the primary control).

import { getSupabaseAdmin } from './supabaseAdmin.js';

const buckets = new Map(); // key -> number[] of request timestamps (ms)

function checkLocal(key, limit, windowMs) {
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

/**
 * @param {string} key   Stable identity for the caller (e.g. `voice:<userId>`).
 * @param {{ limit?: number, windowMs?: number }} opts
 * @returns {Promise<{ allowed: boolean, retryAfterSec?: number }>}
 */
export async function checkRateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const local = checkLocal(key, limit, windowMs);
  if (!local.allowed) return local;

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    });
    if (!error && data === false) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)) };
    }
  } catch {
    // Distributed layer unavailable — the local window already passed.
  }
  return { allowed: true };
}
