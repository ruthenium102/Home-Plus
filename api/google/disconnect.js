// POST /api/google/disconnect
// Body: { family_id: uuid }
// Auth:  Authorization: Bearer <supabase session token>
//
// Any parent in the family can disconnect. Stops the push channel, revokes
// the refresh token on Google's side, deletes the integration row, and
// clears google_event_id on the family's events (so re-connecting later
// creates fresh mirrors rather than referencing stale ids).

import { revokeToken } from '../_lib/googleAuth.js';
import { stopChannel, getFreshAccessToken } from '../_lib/googleCalendar.js';
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

  // Caller must be a parent in this family.
  const { data: caller } = await admin
    .from('family_members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .eq('family_id', family_id)
    .single();
  if (!caller || caller.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can disconnect Google Calendar' });
  }

  const { data: integration } = await admin
    .from('google_calendar_integrations')
    .select('*')
    .eq('family_id', family_id)
    .single();

  if (integration) {
    try {
      if (integration.channel_id && integration.channel_resource_id) {
        const token = await getFreshAccessToken(integration);
        await stopChannel(token, integration.channel_id, integration.channel_resource_id);
      }
    } catch (err) {
      console.warn('[google] stopChannel failed:', err);
    }
    try {
      await revokeToken(integration.refresh_token);
    } catch {
      // ignore
    }

    await admin
      .from('google_calendar_integrations')
      .delete()
      .eq('id', integration.id);

    // Clear stale Google ids so a future reconnect doesn't try to PATCH
    // events that no longer exist on a deleted calendar.
    await admin
      .from('events')
      .update({ google_event_id: null })
      .eq('family_id', family_id)
      .not('google_event_id', 'is', null);
  }

  return res.status(200).json({ ok: true });
}
