// POST /api/google/backfill
// Body: { family_id: uuid }
// Auth:  Authorization: Bearer <supabase session token>
// Returns: { pushed: number, skipped: number, failed: number }
//
// Mirrors every Home Plus event that doesn't yet have a google_event_id
// (and isn't opted out) up to the family's connected Google Calendar.
// Idempotent — events that already mirror are skipped; failures don't
// block the rest of the batch. Called from the Settings UI after the
// initial connect, or any time later to re-sync.

import {
  eventToGoogleBody,
  insertEvent,
  getFreshAccessToken,
} from '../_lib/googleCalendar.js';
import { getSupabaseAdmin, getCallerUser } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getCallerUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { family_id } = req.body || {};
  if (!family_id) return res.status(400).json({ error: 'family_id is required' });

  const admin = getSupabaseAdmin();

  // Caller must be a parent — backfill writes many rows, so we lock it down
  // the same way as connect/disconnect.
  const { data: caller } = await admin
    .from('family_members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .eq('family_id', family_id)
    .single();
  if (!caller || caller.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can backfill Google Calendar' });
  }

  const { data: integration } = await admin
    .from('google_calendar_integrations')
    .select('*')
    .eq('family_id', family_id)
    .single();
  if (!integration) {
    return res.status(400).json({ error: 'Google Calendar not connected for this family' });
  }

  // Pull every event that isn't already mirrored and isn't opted out.
  const { data: events } = await admin
    .from('events')
    .select('*')
    .eq('family_id', family_id)
    .is('google_event_id', null)
    .neq('sync_to_google', false);

  if (!events || events.length === 0) {
    return res.status(200).json({ pushed: 0, skipped: 0, failed: 0 });
  }

  // Member lookup for "Who: …" rendering inside the Google event description.
  const { data: members } = await admin
    .from('family_members')
    .select('id, name')
    .eq('family_id', family_id);
  const memberLookup = {};
  for (const m of members || []) memberLookup[m.id] = m.name;

  const token = await getFreshAccessToken(integration);

  let pushed = 0;
  let failed = 0;
  for (const event of events) {
    try {
      const body = eventToGoogleBody(event, memberLookup);
      const created = await insertEvent(token, integration.google_calendar_id, body);
      if (created?.id) {
        await admin
          .from('events')
          .update({ google_event_id: created.id })
          .eq('id', event.id);
        pushed += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      console.warn('[google] backfill failed for event', event.id, err);
      failed += 1;
    }
  }

  await admin
    .from('google_calendar_integrations')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: failed > 0 ? `${failed} event(s) failed during backfill` : null,
    })
    .eq('id', integration.id);

  return res.status(200).json({ pushed, skipped: 0, failed });
}
