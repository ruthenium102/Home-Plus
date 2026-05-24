// POST /api/google/reconcile
// Body (optional): { family_id: uuid }
// Auth: Authorization: Bearer <supabase session token>
//
// Manual / poll-based sync. The client calls this on app open as a safety
// net for missed webhook deliveries; a daily cron (Vercel scheduled function
// or an external scheduler) can call it without an Authorization header by
// passing the CRON_SECRET env var as `?secret=...` to reconcile every
// integration in the DB.

import { reconcileIntegration } from '../_lib/googleReconcile.js';
import { getSupabaseAdmin, getCallerUser } from '../_lib/supabaseAdmin.js';

function siteUrl(path) {
  const base = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}${path}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = getSupabaseAdmin();
  const webhookUrl = siteUrl('/api/google/webhook');

  // ---- Cron path — reconcile every integration --------------------------
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = (req.query && req.query.secret) || null;
  if (cronSecret && providedSecret && providedSecret === cronSecret) {
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
