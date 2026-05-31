// Service-role Supabase client for serverless API endpoints. Bypasses RLS so
// the OAuth callback can write integration rows on behalf of a parent without
// piping their JWT through.
import { createClient } from '@supabase/supabase-js';

let cached = null;

export function getSupabaseAdmin() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase admin env vars missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.',
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

// Verify the caller's JWT (passed as Authorization: Bearer <token>) and return
// the auth.users row. Returns null if missing/invalid — callers should 401.
export async function getCallerUser(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

// Look up the caller's family_members row for a given family. Returns the row
// ({ id, role }) when the user is a member of that family, otherwise null.
// Callers should 403 on null. Uses the service-role client so it works
// regardless of the caller's own RLS visibility.
export async function getFamilyMember(admin, userId, familyId) {
  if (!userId || !familyId) return null;
  const { data } = await admin
    .from('family_members')
    .select('id, role, name')
    .eq('auth_user_id', userId)
    .eq('family_id', familyId)
    .maybeSingle();
  return data || null;
}
