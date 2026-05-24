// POST /api/google/auth-init
// Body: { family_member_id: uuid }
// Auth:  Authorization: Bearer <supabase session token>
// Returns: { url: string }
//
// Validates the caller is the parent named in family_member_id, persists a
// short-lived CSRF state, and returns the Google OAuth URL the frontend
// should redirect the browser to.

import { randomUUID } from 'node:crypto';
import { buildAuthUrl } from '../_lib/googleAuth.js';
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

  // The caller must be the parent they're connecting on behalf of.
  const { data: member, error: memberErr } = await admin
    .from('family_members')
    .select('id, role, auth_user_id, family_id')
    .eq('id', family_member_id)
    .single();

  if (memberErr || !member) {
    return res.status(404).json({ error: 'Family member not found' });
  }
  if (member.auth_user_id !== user.id) {
    return res
      .status(403)
      .json({ error: 'You can only connect Google Calendar for your own account' });
  }
  if (member.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can connect Google Calendar' });
  }

  const state = randomUUID();
  const { error: stateErr } = await admin
    .from('google_oauth_states')
    .insert({ state, family_member_id });
  if (stateErr) {
    return res.status(500).json({ error: `Failed to persist OAuth state: ${stateErr.message}` });
  }

  try {
    const url = buildAuthUrl(state);
    return res.status(200).json({ url });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Init failed' });
  }
}
