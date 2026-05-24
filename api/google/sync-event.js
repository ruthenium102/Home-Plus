// POST /api/google/sync-event
// Body: { event_id: uuid, action: 'upsert' | 'delete' }
// Auth:  Authorization: Bearer <supabase session token>
//
// Mirrors a single Home Plus event change out to every connected parent's
// Google Calendar. Idempotent — safe to retry. The client should call this
// AFTER an insert/update (the event row exists in the DB), and BEFORE a
// delete (so we can look up the google_event_id via event_google_sync).

import {
  eventToGoogleBody,
  insertEvent,
  patchEvent,
  deleteEvent,
  getFreshAccessToken,
} from '../_lib/googleCalendar.js';
import { getSupabaseAdmin, getCallerUser } from '../_lib/supabaseAdmin.js';

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

  // ---- DELETE path ---------------------------------------------------------
  if (action === 'delete') {
    const { data: syncRows } = await admin
      .from('event_google_sync')
      .select('integration_id, google_event_id, google_calendar_integrations(*)')
      .eq('event_id', event_id);

    if (!syncRows || syncRows.length === 0) {
      return res.status(200).json({ ok: true, deleted: 0 });
    }

    // Verify caller belongs to the event's family. Look up the family via
    // the first integration row (all integrations for one event share a
    // family by construction).
    const firstFamilyId = syncRows[0]?.google_calendar_integrations?.family_id;
    if (firstFamilyId) {
      const { data: caller } = await admin
        .from('family_members')
        .select('id')
        .eq('auth_user_id', user.id)
        .eq('family_id', firstFamilyId)
        .single();
      if (!caller) return res.status(403).json({ error: 'Not a member of this family' });
    }

    let deleted = 0;
    for (const row of syncRows) {
      const integ = row.google_calendar_integrations;
      try {
        const token = await getFreshAccessToken(integ);
        await deleteEvent(token, integ.google_calendar_id, row.google_event_id);
        deleted += 1;
      } catch (err) {
        console.warn('[google] delete failed for integration', integ.id, err);
      }
    }
    // event_google_sync rows will CASCADE when the Home Plus row is deleted
    // by the client immediately after this call.
    return res.status(200).json({ ok: true, deleted });
  }

  // ---- UPSERT path ---------------------------------------------------------
  const { data: event, error: evErr } = await admin
    .from('events')
    .select('*')
    .eq('id', event_id)
    .single();
  if (evErr || !event) return res.status(404).json({ error: 'Event not found' });

  // Caller must be a member of the event's family.
  const { data: caller } = await admin
    .from('family_members')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('family_id', event.family_id)
    .single();
  if (!caller) return res.status(403).json({ error: 'Not a member of this family' });

  if (event.sync_to_google === false) {
    // Opted out — remove any existing mirrors and stop.
    const { data: existing } = await admin
      .from('event_google_sync')
      .select('integration_id, google_event_id, google_calendar_integrations(*)')
      .eq('event_id', event_id);
    let removed = 0;
    for (const row of existing || []) {
      const integ = row.google_calendar_integrations;
      try {
        const token = await getFreshAccessToken(integ);
        await deleteEvent(token, integ.google_calendar_id, row.google_event_id);
      } catch (err) {
        console.warn('[google] opt-out delete failed', err);
      }
      await admin
        .from('event_google_sync')
        .delete()
        .eq('event_id', event_id)
        .eq('integration_id', integ.id);
      removed += 1;
    }
    return res.status(200).json({ ok: true, opted_out: true, removed });
  }

  // Load all integrations for this family.
  const { data: integrations } = await admin
    .from('google_calendar_integrations')
    .select('*')
    .eq('family_id', event.family_id);

  if (!integrations || integrations.length === 0) {
    return res.status(200).json({ ok: true, mirrored: 0 });
  }

  // Build a member id → name map so descriptions can render "Who: …".
  const { data: members } = await admin
    .from('family_members')
    .select('id, name')
    .eq('family_id', event.family_id);
  const memberLookup = {};
  for (const m of members || []) memberLookup[m.id] = m.name;

  const body = eventToGoogleBody(event, memberLookup);

  let mirrored = 0;
  for (const integ of integrations) {
    try {
      const token = await getFreshAccessToken(integ);
      const { data: existing } = await admin
        .from('event_google_sync')
        .select('google_event_id')
        .eq('event_id', event_id)
        .eq('integration_id', integ.id)
        .maybeSingle();

      let googleEventId;
      if (existing?.google_event_id) {
        await patchEvent(token, integ.google_calendar_id, existing.google_event_id, body);
        googleEventId = existing.google_event_id;
      } else {
        const created = await insertEvent(token, integ.google_calendar_id, body);
        googleEventId = created?.id;
      }

      if (googleEventId) {
        await admin
          .from('event_google_sync')
          .upsert(
            {
              event_id,
              integration_id: integ.id,
              google_event_id: googleEventId,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: 'event_id,integration_id' },
          );
        await admin
          .from('google_calendar_integrations')
          .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
          .eq('id', integ.id);
        mirrored += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'sync failed';
      console.warn('[google] mirror failed for integration', integ.id, msg);
      await admin
        .from('google_calendar_integrations')
        .update({ last_sync_error: msg.slice(0, 500) })
        .eq('id', integ.id);
    }
  }

  return res.status(200).json({ ok: true, mirrored });
}
