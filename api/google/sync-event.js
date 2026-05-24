// POST /api/google/sync-event
// Body: { event_id: uuid, action: 'upsert' | 'delete' }
// Auth:  Authorization: Bearer <supabase session token>
//
// Mirrors a single Home Plus event change out to the family's connected
// Google Calendar. Idempotent — safe to retry. The client should call this
// AFTER an insert/update (so events.* is up to date), and BEFORE a delete
// (so we can still read events.google_event_id).

import {
  eventToGoogleBody,
  insertEvent,
  patchEvent,
  deleteEvent,
  getFreshAccessToken,
} from '../_lib/googleCalendar.js';
import { getSupabaseAdmin, getCallerUser } from '../_lib/supabaseAdmin.js';

async function loadEventAndIntegration(admin, eventId) {
  const { data: event } = await admin
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (!event) return { event: null, integration: null };
  const { data: integration } = await admin
    .from('google_calendar_integrations')
    .select('*')
    .eq('family_id', event.family_id)
    .maybeSingle();
  return { event, integration };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getCallerUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { event_id, action } = req.body || {};
  if (!event_id || (action !== 'upsert' && action !== 'delete')) {
    return res.status(400).json({ error: 'event_id and action=upsert|delete required' });
  }

  const admin = getSupabaseAdmin();
  const { event, integration } = await loadEventAndIntegration(admin, event_id);

  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Caller must be a family member.
  const { data: caller } = await admin
    .from('family_members')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('family_id', event.family_id)
    .single();
  if (!caller) return res.status(403).json({ error: 'Not a member of this family' });

  if (!integration) {
    // No Google connected — nothing to mirror. Not an error.
    return res.status(200).json({ ok: true, mirrored: 0 });
  }

  const token = await getFreshAccessToken(integration);

  // ---- DELETE path ---------------------------------------------------------
  if (action === 'delete') {
    if (!event.google_event_id) {
      return res.status(200).json({ ok: true, deleted: 0 });
    }
    try {
      await deleteEvent(token, integration.google_calendar_id, event.google_event_id);
    } catch (err) {
      console.warn('[google] delete failed', err);
    }
    return res.status(200).json({ ok: true, deleted: 1 });
  }

  // ---- UPSERT path ---------------------------------------------------------
  // Opt-out: if the user disabled sync on this event, remove any existing
  // mirror and stop.
  if (event.sync_to_google === false) {
    if (event.google_event_id) {
      try {
        await deleteEvent(token, integration.google_calendar_id, event.google_event_id);
      } catch (err) {
        console.warn('[google] opt-out delete failed', err);
      }
      await admin.from('events').update({ google_event_id: null }).eq('id', event_id);
    }
    return res.status(200).json({ ok: true, opted_out: true });
  }

  const { data: members } = await admin
    .from('family_members')
    .select('id, name')
    .eq('family_id', event.family_id);
  const memberLookup = {};
  for (const m of members || []) memberLookup[m.id] = m.name;

  const body = eventToGoogleBody(event, memberLookup);

  try {
    let googleEventId = event.google_event_id;
    if (googleEventId) {
      await patchEvent(token, integration.google_calendar_id, googleEventId, body);
    } else {
      const created = await insertEvent(token, integration.google_calendar_id, body);
      googleEventId = created?.id || null;
      if (googleEventId) {
        await admin.from('events').update({ google_event_id: googleEventId }).eq('id', event_id);
      }
    }
    await admin
      .from('google_calendar_integrations')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('id', integration.id);
    return res.status(200).json({ ok: true, mirrored: googleEventId ? 1 : 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed';
    console.warn('[google] mirror failed', msg);
    await admin
      .from('google_calendar_integrations')
      .update({ last_sync_error: msg.slice(0, 500) })
      .eq('id', integration.id);
    return res.status(500).json({ error: msg });
  }
}
