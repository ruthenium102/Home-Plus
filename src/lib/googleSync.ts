// Client-side helpers that fire-and-forget event syncs out to Google
// Calendar. Each function POSTs to a Vercel serverless endpoint which holds
// the per-parent refresh tokens server-side; the browser never sees them.
//
// Calls are intentionally non-blocking — UI updates immediately on the
// optimistic local state, and Google mirroring catches up in the background.
// If sync fails (offline, token revoked, etc.), the daily reconcile cron is
// the safety net.

import { supabase } from './supabase';
import { apiUrl } from './apiBase';

async function postWithAuth(path: string, body: unknown): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('[googleSync]', path, err);
  }
}

export function syncEventToGoogle(eventId: string): void {
  void postWithAuth('/api/google/sync-event', { event_id: eventId, action: 'upsert' });
}

// Pass google_event_id from the client where we have it. The server can no
// longer reliably read it from the DB because dbDelete races us — by the
// time the server runs, the row may already be gone.
export function unsyncEventFromGoogle(
  eventId: string,
  googleEventId: string | null | undefined,
  familyId: string,
): void {
  if (!googleEventId) return; // not mirrored, nothing to delete on Google
  void postWithAuth('/api/google/sync-event', {
    event_id: eventId,
    action: 'delete',
    google_event_id: googleEventId,
    family_id: familyId,
  });
}
