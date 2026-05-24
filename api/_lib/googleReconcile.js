// Pull-side sync: take whatever the connected parent's Google Calendar
// looks like right now and merge those changes into Home Plus.
//
// Uses Google's incremental sync token whenever we have one — that's a
// pointer to the previous list response, so subsequent calls only return
// rows that changed. If Google returns 410 GONE the token has expired and
// we drop back to a bounded full sync (timeMin = now - 30d).
//
// Echoes: every event we *sent* to Google carries a
// extendedProperties.private.homePlusEventId tag. When the watch channel
// fires after our own write, those rows come back here — we just refresh
// event_google_sync and skip the Home Plus upsert.

import { randomUUID } from 'node:crypto';
import {
  getFreshAccessToken,
  listEvents,
  watchCalendar,
  stopChannel,
} from './googleCalendar.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const CHANNEL_RENEW_AHEAD_MS = 24 * 60 * 60 * 1000; // renew if expiring within 24h
const FULL_SYNC_WINDOW_DAYS = 30;

function categoryGuess(_summary) {
  // Cheap heuristic placeholder — keeps the type happy. Future: regex/AI.
  return 'general';
}

function googleEventToHomePlusRow(g, integration) {
  const allDay = !!g.start?.date;
  let startISO;
  let endISO;
  if (allDay) {
    startISO = `${g.start.date}T00:00:00Z`;
    const end = new Date(g.end.date);
    end.setUTCDate(end.getUTCDate() - 1); // Google uses exclusive end for all-day
    endISO = `${end.toISOString().slice(0, 10)}T23:59:00Z`;
  } else {
    startISO = new Date(g.start.dateTime).toISOString();
    endISO = new Date(g.end.dateTime).toISOString();
  }
  return {
    family_id: integration.family_id,
    title: g.summary || '(untitled)',
    description: g.description || null,
    start_at: startISO,
    end_at: endISO,
    all_day: allDay,
    location: g.location || null,
    category: categoryGuess(g.summary),
    member_ids: [],
    recurrence: null,
    reminder_offsets: [],
    created_by: integration.family_member_id,
    sync_to_google: true,
  };
}

async function fetchChanges(token, integration) {
  // Full sync path — used on first sync or when Google invalidates the token.
  if (!integration.sync_token) {
    const timeMin = new Date(Date.now() - FULL_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return await listEvents(token, integration.google_calendar_id, {
      singleEvents: true,
      timeMin,
    });
  }
  try {
    return await listEvents(token, integration.google_calendar_id, {
      syncToken: integration.sync_token,
    });
  } catch (err) {
    if (err instanceof Error && /410/.test(err.message)) {
      const timeMin = new Date(Date.now() - FULL_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      return await listEvents(token, integration.google_calendar_id, {
        singleEvents: true,
        timeMin,
      });
    }
    throw err;
  }
}

async function maybeRenewChannel(token, integration, webhookUrl) {
  const admin = getSupabaseAdmin();
  const exp = integration.channel_expires_at
    ? new Date(integration.channel_expires_at).getTime()
    : 0;
  if (integration.channel_id && exp - Date.now() > CHANNEL_RENEW_AHEAD_MS) {
    return; // still healthy
  }
  // Stop the old channel (best-effort) then open a fresh one.
  if (integration.channel_id && integration.channel_resource_id) {
    try {
      await stopChannel(token, integration.channel_id, integration.channel_resource_id);
    } catch {
      // ignore
    }
  }
  try {
    const ch = await watchCalendar(token, integration.google_calendar_id, randomUUID(), webhookUrl);
    await admin
      .from('google_calendar_integrations')
      .update({
        channel_id: ch?.id || null,
        channel_resource_id: ch?.resourceId || null,
        channel_expires_at: ch?.expiration
          ? new Date(Number(ch.expiration)).toISOString()
          : null,
      })
      .eq('id', integration.id);
  } catch (err) {
    console.warn('[google] channel renew failed:', err);
  }
}

export async function reconcileIntegration(integrationId, webhookUrl) {
  const admin = getSupabaseAdmin();
  const { data: integration, error } = await admin
    .from('google_calendar_integrations')
    .select('*')
    .eq('id', integrationId)
    .single();
  if (error || !integration) throw new Error('Integration not found');

  const token = await getFreshAccessToken(integration);
  await maybeRenewChannel(token, integration, webhookUrl);

  let pageToken;
  let nextSyncToken;
  let upserts = 0;
  let deletes = 0;
  let echoes = 0;

  do {
    const page = await fetchChanges(
      token,
      pageToken ? { ...integration, sync_token: null } : integration,
    );
    if (!page) break;
    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
    } else {
      pageToken = undefined;
      nextSyncToken = page.nextSyncToken;
    }

    for (const g of page.items || []) {
      const homePlusEventId = g.extendedProperties?.private?.homePlusEventId;

      // Cancelled: delete from Home Plus if we have a mapping.
      if (g.status === 'cancelled') {
        const { data: existing } = await admin
          .from('event_google_sync')
          .select('event_id')
          .eq('integration_id', integration.id)
          .eq('google_event_id', g.id)
          .maybeSingle();
        if (existing) {
          // Remove the mapping for this parent. If no other parent still
          // mirrors this event, drop the Home Plus row too.
          await admin
            .from('event_google_sync')
            .delete()
            .eq('event_id', existing.event_id)
            .eq('integration_id', integration.id);
          const { count } = await admin
            .from('event_google_sync')
            .select('event_id', { count: 'exact', head: true })
            .eq('event_id', existing.event_id);
          if (!count || count === 0) {
            await admin.from('events').delete().eq('id', existing.event_id);
          }
          deletes += 1;
        }
        continue;
      }

      // Echo of our own write — refresh the mapping, leave the row alone.
      if (homePlusEventId) {
        await admin
          .from('event_google_sync')
          .upsert(
            {
              event_id: homePlusEventId,
              integration_id: integration.id,
              google_event_id: g.id,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: 'event_id,integration_id' },
          );
        echoes += 1;
        continue;
      }

      // External event — does this parent already have a mapping for it?
      const { data: existing } = await admin
        .from('event_google_sync')
        .select('event_id')
        .eq('integration_id', integration.id)
        .eq('google_event_id', g.id)
        .maybeSingle();

      const row = googleEventToHomePlusRow(g, integration);

      if (existing?.event_id) {
        await admin.from('events').update(row).eq('id', existing.event_id);
        await admin
          .from('event_google_sync')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('event_id', existing.event_id)
          .eq('integration_id', integration.id);
      } else {
        const { data: inserted, error: insErr } = await admin
          .from('events')
          .insert(row)
          .select('id')
          .single();
        if (insErr || !inserted) continue;
        await admin
          .from('event_google_sync')
          .insert({
            event_id: inserted.id,
            integration_id: integration.id,
            google_event_id: g.id,
            last_synced_at: new Date().toISOString(),
          });
      }
      upserts += 1;
    }
  } while (pageToken);

  await admin
    .from('google_calendar_integrations')
    .update({
      sync_token: nextSyncToken || integration.sync_token,
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
    })
    .eq('id', integration.id);

  return { upserts, deletes, echoes };
}
