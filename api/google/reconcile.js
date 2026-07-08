// POST /api/google/reconcile
// Body (optional): { family_id: uuid }
// Auth: Authorization: Bearer <supabase session token>
//
// Manual / poll-based sync. The client calls this on app open as a safety
// net for missed webhook deliveries; the daily Vercel cron (vercel.json
// "crons") reconciles every integration in the DB. Vercel authenticates its
// cron invocations by sending `Authorization: Bearer <CRON_SECRET>`
// automatically when the CRON_SECRET env var is set — the secret is NEVER
// accepted via the query string (query params land in request logs).

import { timingSafeEqual } from 'node:crypto';
import { reconcileIntegration } from '../_lib/googleReconcile.js';
import { getSupabaseAdmin, getCallerUser } from '../_lib/supabaseAdmin.js';

// Constant-time comparison so the cron secret can't be probed byte-by-byte.
function secretMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function siteUrl(path) {
  const base = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}${path}`;
}

export default async function handler(req, res) {
  // Vercel cron invocations are GETs; the user-initiated path is POST.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = getSupabaseAdmin();
  const webhookUrl = siteUrl('/api/google/webhook');

  // ---- Cron path — reconcile every integration --------------------------
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers?.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (cronSecret && secretMatches(bearer, cronSecret)) {
    const { data: all } = await admin
      .from('google_calendar_integrations')
      .select('id');
    const results = { ok: 0, failed: 0 };
    for (const row of all || []) {
      try {
        await reconcileIntegration(row.id, webhookUrl);
        results.ok += 1;
      } catch (err) {
        results.failed += 1;
        console.warn('[reconcile] failed for', row.id, err);
      }
    }
    return res.status(200).json({ ok: true, ...results });
  }

  // ---- User-initiated path — reconcile every integration in their family
  const user = await getCallerUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { family_id } = req.body || {};
  if (!family_id) return res.status(400).json({ error: 'family_id required' });

  const { data: caller } = await admin
    .from('family_members')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('family_id', family_id)
    .single();
  if (!caller) return res.status(403).json({ error: 'Not a member of this family' });

  const { data: integrations } = await admin
    .from('google_calendar_integrations')
    .select('id')
    .eq('family_id', family_id);

  const results = { ok: 0, failed: 0 };
  for (const row of integrations || []) {
    try {
      await reconcileIntegration(row.id, webhookUrl);
      results.ok += 1;
    } catch (err) {
      results.failed += 1;
      console.warn('[reconcile] failed for', row.id, err);
    }
  }
  return res.status(200).json({ ok: true, ...results });
}
