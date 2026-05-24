// Google Calendar API helpers. Every function takes an access token that the
// caller has already refreshed via getFreshAccessToken().
//
// Reference: https://developers.google.com/calendar/api/v3/reference

const API = 'https://www.googleapis.com/calendar/v3';

import { refreshAccessToken } from './googleAuth.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

// Return a valid access token for the given integration row, refreshing and
// persisting if the cached one is expired (or within 60s of expiring).
export async function getFreshAccessToken(integration) {
  const now = Date.now();
  const exp = integration.access_token_expires_at
    ? new Date(integration.access_token_expires_at).getTime()
    : 0;
  if (integration.access_token && exp - now > 60_000) {
    return integration.access_token;
  }
  const tokens = await refreshAccessToken(integration.refresh_token);
  const expiresAt = new Date(now + (tokens.expires_in ?? 3600) * 1000).toISOString();
  const admin = getSupabaseAdmin();
  await admin
    .from('google_calendar_integrations')
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
    })
    .eq('id', integration.id);
  return tokens.access_token;
}

async function gfetch(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (res.status === 204 || res.status === 404) {
    // 404 on delete is benign (event already gone)
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Calendar ${init.method || 'GET'} ${path} failed: ${res.status} ${text}`);
  }
  return await res.json().catch(() => null);
}

export async function createCalendar(token, summary, timezone) {
  return gfetch(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary,
      timeZone: timezone || 'UTC',
      description: 'Home Plus shared family calendar — synced automatically. Do not rename.',
    }),
  });
}

export async function deleteCalendar(token, calendarId) {
  return gfetch(token, `/calendars/${encodeURIComponent(calendarId)}`, {
    method: 'DELETE',
  });
}

export async function insertEvent(token, calendarId, body) {
  return gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchEvent(token, calendarId, eventId, body) {
  return gfetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function deleteEvent(token, calendarId, eventId) {
  return gfetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
}

// Incremental list using a sync token (preferred). On first call, omit
// syncToken; Google returns a next_sync_token to use next time. If Google
// returns 410 GONE, the caller should drop the sync token and do a full
// resync (singleEvents=true, timeMin = now - 30d) to recover.
export async function listEvents(token, calendarId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.syncToken) params.set('syncToken', opts.syncToken);
  if (opts.pageToken) params.set('pageToken', opts.pageToken);
  if (opts.timeMin) params.set('timeMin', opts.timeMin);
  if (opts.singleEvents) params.set('singleEvents', 'true');
  params.set('maxResults', '250');
  return gfetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  );
}

// Open (or renew) a push notification channel. Google posts to webhookUrl
// with an X-Goog-Resource-State header (sync/exists/not_exists) whenever the
// calendar changes. Channels expire after ~7 days, so we re-up via cron.
export async function watchCalendar(token, calendarId, channelId, webhookUrl) {
  return gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: 'POST',
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      // 7 days max; we'll renew before expiry via cron.
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }),
  });
}

export async function stopChannel(token, channelId, resourceId) {
  return gfetch(token, '/channels/stop', {
    method: 'POST',
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}

// Convert a Home Plus event row into the Google Calendar event body.
// member_ids array is rendered into the description so the human reader can
// tell who an event applies to; we don't translate to Google attendees
// because family members are profiles in our app, not Google identities.
export function eventToGoogleBody(event, memberLookup = {}) {
  const memberNames = (event.member_ids || [])
    .map((id) => memberLookup[id])
    .filter(Boolean)
    .join(', ');
  const descLines = [];
  if (event.description) descLines.push(event.description);
  if (memberNames) descLines.push(`Who: ${memberNames}`);
  descLines.push('— synced from Home Plus');
  const body = {
    summary: event.title,
    description: descLines.join('\n\n'),
    location: event.location || undefined,
    extendedProperties: {
      private: {
        homePlusEventId: event.id,
        homePlusCategory: event.category || 'general',
      },
    },
  };
  if (event.all_day) {
    body.start = { date: event.start_at.slice(0, 10) };
    // Google expects end.date to be the day AFTER the last day for all-day events
    const endDate = new Date(event.end_at);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    body.end = { date: endDate.toISOString().slice(0, 10) };
  } else {
    body.start = { dateTime: event.start_at };
    body.end = { dateTime: event.end_at };
  }
  if (event.recurrence?.rrule) {
    body.recurrence = [event.recurrence.rrule.startsWith('RRULE:')
      ? event.recurrence.rrule
      : `RRULE:${event.recurrence.rrule}`];
  }
  if (Array.isArray(event.reminder_offsets) && event.reminder_offsets.length > 0) {
    body.reminders = {
      useDefault: false,
      overrides: event.reminder_offsets.slice(0, 5).map((m) => ({
        method: 'popup',
        minutes: m,
      })),
    };
  }
  return body;
}
