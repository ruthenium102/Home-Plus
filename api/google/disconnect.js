// POST /api/google/disconnect
// Body: { family_member_id: uuid }
// Auth:  Authorization: Bearer <supabase session token>
//
// Stops the push channel, revokes the refresh token on Google's side, and
// deletes the integration row. Per-event sync rows cascade away. The Home
// Plus event rows themselves are untouched (events stay; only the mirror
// linkage is dropped).

import { revokeToken } from '../_lib/googleAuth.js';
import { stopChannel, getFreshAccessToken } from '../_lib/googleCalendar.js';
import { getSupabaseAdmin, getCallerUser } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await getCallerUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { family_member_id } = req.body || {};
  if (!family_member_id) {
    return res.status(400).json({ error: 'family_member_id is required' });
  }

  const admin = getSupabaseAdmin();

  const { data: member } = await admin
    .from('family_members')
    .select('id, auth_user_id')
    .eq('id', family_member_id)
    .single();
  if (!member || member.auth_user_id !== user.id) {
    return res.status(403).json({ error: 'You can only disconnect your own integration' });
  }

  const { data: integration } = await admin
    .from('google_calendar_integrations')
    .select('*')
    .eq('family_member_id', family_member_id)
    .single();

  if (integration) {
    // Best-effort cleanup on Google's side. Failures here don't block the
    // local delete — the user expects "disconnect" to actually disconnect.
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
  }

  return res.status(200).json({ ok: true });
}
