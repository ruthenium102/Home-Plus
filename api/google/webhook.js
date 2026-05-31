// POST /api/google/webhook
//
// Google's push channel pings us when a watched calendar changes. We have no
// body — the headers tell us which channel fired. We look up the matching
// integration and run reconcileIntegration() which pulls the actual delta.
//
// X-Goog-Channel-ID       — uuid we generated when opening the channel
// X-Goog-Channel-Token    — secret we set on the channel; validated below so a
//                           forged notification can't trigger a sync
// X-Goog-Resource-State   — sync | exists | not_exists
// X-Goog-Resource-ID      — opaque calendar handle (for stopping the channel)

import { reconcileIntegration } from '../_lib/googleReconcile.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

function header(req, name) {
  // Vercel lowercases incoming header names.
  const k = name.toLowerCase();
  const v = req.headers?.[k];
  return Array.isArray(v) ? v[0] : v || null;
}

function siteUrl(path) {
  const base = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}${path}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const channelId = header(req, 'X-Goog-Channel-ID');
  const channelToken = header(req, 'X-Goog-Channel-Token');
  const state = header(req, 'X-Goog-Resource-State');

  if (!channelId) {
    // Some malformed call — ack so Google doesn't retry.
    return res.status(200).end();
  }

  // 'sync' is the initial handshake; nothing to do.
  if (state === 'sync') {
    return res.status(200).end();
  }

  // Resolve the integration this channel belongs to and validate the secret
  // token we set when opening the channel. A forged push that guesses the
  // channel id but not the token is rejected (403) before any DB write/sync.
  const admin = getSupabaseAdmin();
  const { data: integration } = await admin
    .from('google_calendar_integrations')
    .select('id, channel_token')
    .eq('channel_id', channelId)
    .maybeSingle();

  if (!integration) {
    // Channel id doesn't match anything we know — channel was probably
    // already stopped; ack so Google removes it from its retry queue.
    return res.status(200).end();
  }

  // If we have a token on record, the push must present a matching one.
  // (Channels opened before this field existed have null token; those are
  // renewed with a token within ~7 days by maybeRenewChannel.)
  if (integration.channel_token && integration.channel_token !== channelToken) {
    return res.status(403).send('Invalid channel token');
  }

  // 'not_exists' means the watched calendar (or channel) was deleted —
  // record the failure so the Settings UI surfaces it and stop here.
  if (state === 'not_exists') {
    await admin
      .from('google_calendar_integrations')
      .update({ last_sync_error: 'Watched calendar was removed on Google.' })
      .eq('id', integration.id);
    return res.status(200).end();
  }

  try {
    await reconcileIntegration(integration.id, siteUrl('/api/google/webhook'));
  } catch (err) {
    console.warn('[google] webhook reconcile failed', err);
    await admin
      .from('google_calendar_integrations')
      .update({
        last_sync_error: (err instanceof Error ? err.message : 'reconcile failed').slice(0, 500),
      })
      .eq('id', integration.id);
  }

  return res.status(200).end();
}
