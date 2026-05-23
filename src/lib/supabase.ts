import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase singleton. If env vars are missing we still export a working stub
 * so the UI can render in "demo mode" without crashing — handy for the first
 * boot before the .env is wired up.
 *
 * Note: the client is intentionally untyped at the supabase-js generic level
 * because we use sub-projections like .select('family_id') and rpc('fn_name',
 * args) for functions not in the schema-typed surface. Strict row types live
 * in src/types/supabase.ts and are applied at the db.ts wrapper layer (where
 * dbUpsert and dbLoadFamily narrow the data shape for callers).
 */
export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon, { auth: { persistSession: true } }) : null;

export const isSupabaseConfigured = supabase !== null;

if (!isSupabaseConfigured) {
   
  console.warn(
    '[Home Plus] Supabase env vars missing. Running in demo mode with seeded local data. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable persistence.',
  );
}
