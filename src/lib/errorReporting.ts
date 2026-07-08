// Production error visibility without an external service: uncaught errors
// and unhandled rejections are written to the `client_errors` table in the
// app's own Supabase project (migrate_v26 — INSERT-only for authenticated
// users; clients can never read it back). Read them in the Supabase dashboard:
//   select * from client_errors order by created_at desc;
//
// Deliberately conservative: capped per session, deduped by message, silent on
// failure (an error reporter must never cause errors), and no-op in demo mode.

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const MAX_REPORTS_PER_SESSION = 10;
const seen = new Set<string>();
let reported = 0;

export function reportClientError(message: string, stack?: string | null, source?: string | null) {
  try {
    if (!isSupabaseConfigured || !supabase) return;
    if (reported >= MAX_REPORTS_PER_SESSION) return;
    const key = message.slice(0, 200);
    if (seen.has(key)) return;
    seen.add(key);
    reported += 1;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        const userId = data.session?.user?.id;
        if (!userId || !supabase) return; // RLS requires an authed reporter
        return supabase.from('client_errors').insert({
          auth_user_id: userId,
          message: message.slice(0, 500),
          stack: stack ? stack.slice(0, 4000) : null,
          source: source ? source.slice(0, 300) : null,
          app_version: __APP_VERSION__,
          user_agent: navigator.userAgent.slice(0, 300),
        });
      })
      .then(undefined, () => {});
  } catch {
    /* never throw from the reporter */
  }
}

/** Install global uncaught-error/rejection hooks. Call once at startup. */
export function initErrorReporting() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    reportClientError(
      e.message || 'Unknown error',
      e.error instanceof Error ? e.error.stack : null,
      e.filename ? `${e.filename}:${e.lineno ?? 0}` : null,
    );
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as unknown;
    const msg =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled rejection';
    reportClientError(`unhandledrejection: ${msg}`, reason instanceof Error ? reason.stack : null);
  });
}
