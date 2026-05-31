// GET /api/google/callback?code=...&state=...
//
// Browser redirect target after the user grants consent on accounts.google.com.
// Exchanges the code for tokens, creates the family's dedicated calendar,
// opens a push channel, persists a single integration row keyed on family_id,
// then redirects to /settings?google=connected.
//
// If a family is already connected (re-connecting after a disconnect, or a
// different parent reconnecting) the row is replaced — the unique(family_id)
// constraint and onConflict make this idempotent.

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
  await admin.from('google_oauth_states').delete().eq('state', state);

  // Resolve the member who clicked Connect (for connected_by_member_id) and
  // their family (for naming the calendar + timezone).
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
      return redirect(res, siteRedirect('/settings?google=error&reason=no_refresh_token'));
    }

    const googleEmail = emailFromIdToken(tokens.id_token) || 'unknown@google';
    const familyName = member.families?.name || 'Family';
    const timezone = member.families?.timezone || 'UTC';

    const calendar = await createCalendar(
      tokens.access_token,
      `Home Plus – ${familyName}`,
      timezone,
    );

    let channelInfo = null;
    // Secret echoed back by Google on every push as X-Goog-Channel-Token; the
    // webhook validates it so a forged notification can't trigger a sync.
    const channelToken = randomUUID();
    try {
      const webhookUrl = siteRedirect('/api/google/webhook');
      channelInfo = await watchCalendar(
        tokens.access_token,
        calendar.id,
        randomUUID(),
        webhookUrl,
        channelToken,
      );
    } catch (watchErr) {
      console.warn('[google] watchCalendar failed, falling back to poll-only:', watchErr);
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    const { error: upsertErr } = await admin
      .from('google_calendar_integrations')
      .upsert(
        {
          family_id: member.family_id,
          connected_by_member_id: member.id,
          google_account_email: googleEmail,
          google_calendar_id: calendar.id,
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          access_token_expires_at: expiresAt,
          sync_token: null,
          channel_id: channelInfo?.id || null,
          channel_resource_id: channelInfo?.resourceId || null,
          channel_token: channelInfo ? channelToken : null,
          channel_expires_at: channelInfo?.expiration
            ? new Date(Number(channelInfo.expiration)).toISOString()
            : null,
          last_synced_at: null,
          last_sync_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'family_id' },
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
