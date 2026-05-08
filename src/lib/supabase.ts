import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase singleton. If env vars are missing we still export a working stub
 * so the UI can render in "demo mode" without crashing — handy for the first
 * boot before the .env is wired up. (Lesson learned from Kitchen Plus.)
 */
export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon, { auth: { persistSession: true } }) : null;

export const isSupabaseConfigured = supabase !== null;

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Home Plus] Supabase env vars missing. Running in demo mode with seeded local data. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable persistence.'
  );
}
