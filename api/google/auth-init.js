// POST /api/google/auth-init
// Body: { family_id: uuid }
// Auth:  Authorization: Bearer <supabase session token>
// Returns: { url: string }
//
// Validates the caller is a parent in the given family, persists a short-
// lived CSRF state row, and returns the Google OAuth URL to redirect the
// browser to. Any parent can initiate the connection — the Google account
// they sign in with does not need to match their family_members.email.

import { randomUUID } from 'node:crypto';
import { buildAuthUrl } from '../_lib/googleAuth.js';
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
  const { data: member, error: memberErr } = await admin
    .from('family_members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .eq('family_id', family_id)
    .single();

  if (memberErr || !member) {
    return res.status(403).json({ error: 'Not a member of this family' });
  }
  if (member.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can connect Google Calendar' });
  }

  // CSRF state — stored against the connecting member so the callback knows
  // who clicked Connect (recorded as connected_by_member_id).
  const state = randomUUID();
  const { error: stateErr } = await admin
    .from('google_oauth_states')
    .insert({ state, family_member_id: member.id });
  if (stateErr) {
    return res.status(500).json({ error: `Failed to persist OAuth state: ${stateErr.message}` });
  }

  // Opportunistically reap expired/abandoned state rows so the table doesn't
  // grow unbounded (each Connect click inserts one; only completed flows are
  // deleted on the callback). Best-effort — never block the connect.
  admin.rpc('cleanup_google_oauth_states').then(
    () => {},
    (err) => console.warn('[google] cleanup_google_oauth_states failed', err),
  );

  try {
    return res.status(200).json({ url: buildAuthUrl(state) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Init failed' });
  }
}
