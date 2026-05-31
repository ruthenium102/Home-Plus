/**
 * POST /api/account/delete
 * Auth: Authorization: Bearer <supabase session token> (required)
 * Body: none — the user id is derived from the JWT, never from the request, so
 *       a caller can only ever delete THEIR OWN account.
 *
 * Implements L3 / R5 — in-app account deletion (Apple Guideline 5.1.1(v)).
 *
 * Flow:
 *   1. Verify the caller's JWT via getCallerUser (401 if missing/invalid).
 *   2. Call the SECURITY DEFINER public.delete_account() RPC *as the caller*
 *      (anon client with the caller's Bearer token) so auth.uid() inside the
 *      function resolves to this user. That RPC runs the entire data cascade in
 *      one transaction:
 *        • families the caller owns / is sole parent of  → whole family deleted
 *          (every child table cascades from families(id))
 *        • shared families with other parents / child rows → only the caller's
 *          own family_members row(s) removed (member_pins + oauth states cascade)
 *   3. Only after the data deletion succeeds, delete the auth.users row with the
 *      service-role admin API. Doing the data cascade first means a failure
 *      there leaves the login intact (the user can retry), and a failure at
 *      step 3 leaves no family data but a still-deletable login — never an
 *      orphaned half-deleted family.
 *
 * Returns: { ok: true } on success.
 */
import { createClient } from '@supabase/supabase-js';
import { getCallerUser, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Require a valid Supabase session. The user id is taken from the verified
  // token only.
  const user = await getCallerUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated' });

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return res.status(500).json({ ok: false, error: 'Server is misconfigured' });
  }

  // Re-derive the Bearer token so we can run delete_account() *as the caller*
  // (auth.uid() inside the SECURITY DEFINER fn must resolve to this user).
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader.slice('Bearer '.length);
  const callerClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 1 — atomic, transactional data cascade. Done before touching the auth
  // user so a partial failure here leaves the login intact and retryable.
  const { error: rpcError } = await callerClient.rpc('delete_account');
  if (rpcError) {
    console.error('delete_account RPC error:', rpcError);
    return res.status(500).json({ ok: false, error: 'Failed to delete account data' });
  }

  // Step 2 — remove the login itself. Service-role only.
  const admin = getSupabaseAdmin();
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error('admin.deleteUser error:', deleteUserError);
    // Data is already gone; surface the failure so the client knows the login
    // may still exist and can be retried / supported manually.
    return res.status(500).json({ ok: false, error: 'Failed to remove the login' });
  }

  return res.status(200).json({ ok: true });
}
