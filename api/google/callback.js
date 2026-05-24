// GET /api/google/callback?code=...&state=...
//
// Browser redirect target after the user grants consent on accounts.google.com.
// Exchanges the code for tokens, creates a dedicated "Home Plus – [Family]"
// Google Calendar, opens a push channel, persists the integration row, then
// redirects the browser to /settings?google=connected (or ?google=error).

import { randomUUID } from 'node:crypto';
import {
  exchangeCodeForTokens,
  emailFromIdToken,
} from '../_lib/googleAuth.js';
import {
  createCalendar,
  watchCalendar,
} from '../_lib/googleCalendar.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function siteRedirect(path) {
  const base = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}${path}`;
}

export default async function handler(req, res) {
  const { code, state, error: oauthError } = req.query || {};

  if (oauthError) {
    return redirect(res, siteRedirect(`/settings?google=error&reason=${encodeURIComponent(String(oauthError))}`));
  }
  if (!code || !state) {
    return redirect(res, siteRedirect('/settings?google=error&reason=missing_params'));
  }

  const admin = getSupabaseAdmin();

  // Look up + consume the CSRF state row.
  const { data: stateRow, error: stateErr } = await admin
    .from('google_oauth_states')
    .select('family_member_id, expires_at')
    .eq('state', state)
    .single();
  if (stateErr || !stateRow) {
    return redirect(res, siteRedirect('/settings?google=error&reason=bad_state'));
  }
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await admin.from('google_oauth_states').delete().eq('state', state);
    return redirect(res, siteRedirect('/settings?google=error&reason=state_expired'));
  }
  // Single-use — delete now so a replay can't reuse this state.
  await admin.from('google_oauth_states').delete().eq('state', state);

  // Resolve the family member + family (for naming the calendar + timezone).
  const { data: member, error: memberErr } = await admin
    .from('family_members')
    .select('id, family_id, role, families:family_id(name, timezone)')
    .eq('id', stateRow.family_member_id)
    .single();
  if (memberErr || !member) {
    return redirect(res, siteRedirect('/settings?google=error&reason=member_missing'));
  }
  if (member.role !== 'parent') {
    return redirect(res, siteRedirect('/settings?google=error&reason=not_parent'));
  }

  try {
    const tokens = await exchangeCodeForTokens(String(code));
    if (!tokens.refresh_token) {
      // This happens if the user previously consented without prompt=consent.
      // Our buildAuthUrl always sends prompt=consent so this is rare, but if
      // it does occur the right fix is to have the user revoke the app on
      // their Google account page and reconnect.
      return redirect(res, siteRedirect('/settings?google=error&reason=no_refresh_token'));
    }

    const googleEmail = emailFromIdToken(tokens.id_token) || 'unknown@google';
    const familyName = member.families?.name || 'Family';
    const timezone = member.families?.timezone || 'UTC';

    // Create the dedicated calendar on the user's Google account.
    const calendar = await createCalendar(
      tokens.access_token,
      `Home Plus – ${familyName}`,
      timezone,
    );

    // Open a push channel so Google notifies us of changes. The webhook
    // endpoint URL must be HTTPS and publicly reachable, which Vercel
    // gives us for free in prod. In local dev this will fail silently —
    // the daily reconcile cron is the safety net.
    let channelInfo = null;
    try {
      const webhookUrl = siteRedirect('/api/google/webhook');
      channelInfo = await watchCalendar(
        tokens.access_token,
        calendar.id,
        randomUUID(),
        webhookUrl,
      );
    } catch (watchErr) {
      // Non-fatal — sync still works via reconcile.
      console.warn('[google] watchCalendar failed, falling back to poll-only:', watchErr);
    }

    // Upsert the integration row. If a row already exists for this parent
    // (re-connect after a disconnect), replace it.
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    const { error: upsertErr } = await admin
      .from('google_calendar_integrations')
      .upsert(
        {
          family_id: member.family_id,
          family_member_id: member.id,
          google_account_email: googleEmail,
          google_calendar_id: calendar.id,
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          access_token_expires_at: expiresAt,
          sync_token: null,
          channel_id: channelInfo?.id || null,
          channel_resource_id: channelInfo?.resourceId || null,
          channel_expires_at: channelInfo?.expiration
            ? new Date(Number(channelInfo.expiration)).toISOString()
            : null,
          last_synced_at: null,
          last_sync_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'family_member_id' },
      );

    if (upsertErr) {
      return redirect(res, siteRedirect(`/settings?google=error&reason=${encodeURIComponent(upsertErr.message)}`));
    }

    return redirect(res, siteRedirect('/settings?google=connected'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'callback_failed';
    return redirect(res, siteRedirect(`/settings?google=error&reason=${encodeURIComponent(msg)}`));
  }
}
