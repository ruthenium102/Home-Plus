// Client-side helpers that fire-and-forget event syncs out to Google
// Calendar. Each function POSTs to a Vercel serverless endpoint which holds
// the per-parent refresh tokens server-side; the browser never sees them.
//
// Calls are intentionally non-blocking — UI updates immediately on the
// optimistic local state, and Google mirroring catches up in the background.
// If sync fails (offline, token revoked, etc.), the daily reconcile cron is
// the safety net.

import { supabase } from './supabase';

async function postWithAuth(path: string, body: unknown): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(path, {
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

export function unsyncEventFromGoogle(eventId: string): void {
  void postWithAuth('/api/google/sync-event', { event_id: eventId, action: 'delete' });
}
