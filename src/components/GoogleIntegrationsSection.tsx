import { useCallback, useEffect, useState } from 'react';
import { Calendar, Loader2, RefreshCw, Unplug, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useFamily } from '@/context/FamilyContext';

interface IntegrationRow {
  google_account_email: string;
  connected_by_name: string;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

type Banner = { kind: 'success' | 'error'; text: string } | null;

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

async function authedFetch(path: string, body?: unknown): Promise<Response | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function GoogleIntegrationsSection() {
  const { family, activeMember } = useFamily();
  const [row, setRow] = useState<IntegrationRow | null>(null);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'sync' | 'backfill' | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc('get_family_google_integration', {
      p_family_id: family.id,
    });
    const first = Array.isArray(data) ? (data[0] as IntegrationRow | undefined) : undefined;
    setRow(first ?? null);
  }, [family.id]);

  // Initial load + realtime subscription so a connect/disconnect on another
  // device updates this UI without a refresh.
  useEffect(() => {
    void refresh();
    if (!supabase) return;
    const ch = supabase
      .channel(`gci-${family.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'google_calendar_integrations',
          filter: `family_id=eq.${family.id}`,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(ch);
    };
  }, [family.id, refresh]);

  // Post-OAuth redirect banner from /api/google/callback.
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('google');
    if (!status) return;
    if (status === 'connected') {
      setBanner({ kind: 'success', text: 'Google Calendar connected.' });
      void refresh();
    } else if (status === 'error') {
      const reason = url.searchParams.get('reason') || 'unknown';
      setBanner({ kind: 'error', text: `Couldn't connect: ${reason}` });
    }
    url.searchParams.delete('google');
    url.searchParams.delete('reason');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
    const t = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const activeIsParent = activeMember?.role === 'parent';

  const handleConnect = useCallback(async () => {
    setBusy('connect');
    try {
      const res = await authedFetch('/api/google/auth-init', { family_id: family.id });
      if (!res || !res.ok) {
        const msg = res ? (await res.json().catch(() => ({}))).error || res.statusText : 'Not signed in';
        setBanner({ kind: 'error', text: `Connect failed: ${msg}` });
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Connect failed' });
    } finally {
      setBusy(null);
    }
  }, [family.id]);

  const handleDisconnect = useCallback(async () => {
    setBusy('disconnect');
    try {
      const res = await authedFetch('/api/google/disconnect', { family_id: family.id });
      if (!res || !res.ok) {
        const msg = res ? (await res.json().catch(() => ({}))).error || res.statusText : 'Not signed in';
        setBanner({ kind: 'error', text: `Disconnect failed: ${msg}` });
        return;
      }
      setBanner({ kind: 'success', text: 'Disconnected.' });
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [family.id, refresh]);

  const handleReconcile = useCallback(async () => {
    setBusy('sync');
    try {
      const res = await authedFetch('/api/google/reconcile', { family_id: family.id });
      if (res?.ok) {
        setBanner({ kind: 'success', text: 'Synced.' });
        await refresh();
      } else {
        setBanner({ kind: 'error', text: 'Sync failed.' });
      }
    } finally {
      setBusy(null);
    }
  }, [family.id, refresh]);

  const handleBackfill = useCallback(async () => {
    setBusy('backfill');
    try {
      const res = await authedFetch('/api/google/backfill', { family_id: family.id });
      if (!res?.ok) {
        const msg = res ? (await res.json().catch(() => ({}))).error || res.statusText : 'Not signed in';
        setBanner({ kind: 'error', text: `Backfill failed: ${msg}` });
        return;
      }
      const { pushed, updated, failed } = await res.json();
      if (pushed === 0 && updated === 0 && failed === 0) {
        setBanner({ kind: 'success', text: 'No events to sync.' });
      } else {
        const parts = [];
        if (pushed > 0) parts.push(`pushed ${pushed} new`);
        if (updated > 0) parts.push(`refreshed ${updated}`);
        if (failed > 0) parts.push(`${failed} failed`);
        setBanner({ kind: failed > 0 ? 'error' : 'success', text: `Sync: ${parts.join(', ')}.` });
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [family.id, refresh]);

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h2 className="font-display text-lg text-text flex items-center gap-2">
          <Calendar size={16} className="text-accent" /> Google Calendar
        </h2>
        {row && (
          <button
            onClick={handleReconcile}
            disabled={busy === 'sync'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-text rounded-md hover:bg-surface-2 disabled:opacity-50"
            title="Pull the latest from Google"
          >
            {busy === 'sync' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Sync now
          </button>
        )}
      </div>
      <p className="text-sm text-text-muted mb-4">
        Optional 2-way sync for the whole family. When connected, we create a
        dedicated <em>Home Plus &ndash; {family.name}</em> calendar in your
        Google account. The Google account can be any account &mdash; a shared
        family Gmail works well.
      </p>

      {banner && (
        <div
          className={`text-sm rounded-md px-3 py-2 mb-3 ${
            banner.kind === 'success'
              ? 'bg-success/15 text-success'
              : 'bg-danger/15 text-danger'
          }`}
        >
          {banner.text}
        </div>
      )}

      {row ? (
        <div className="px-3 py-3 rounded-md bg-surface-2 border border-border">
          <div className="text-sm text-text">
            Connected as <span className="font-medium">{row.google_account_email}</span>
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            Set up by {row.connected_by_name} &middot; last sync {timeAgo(row.last_synced_at)}
            {row.last_sync_error && (
              <span className="text-danger">
                {' '}&middot; {row.last_sync_error}
              </span>
            )}
          </div>
          {activeIsParent && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void handleBackfill()}
                disabled={busy === 'backfill'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-text bg-surface border border-border rounded-md disabled:opacity-50"
                title="Mirror every Home Plus event to Google (insert new, refresh existing)"
              >
                {busy === 'backfill' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Upload size={12} />
                )}
                Re-sync all events
              </button>
              <button
                onClick={() => void handleDisconnect()}
                disabled={busy === 'disconnect'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-text bg-surface border border-border rounded-md disabled:opacity-50"
              >
                {busy === 'disconnect' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Unplug size={12} />
                )}
                Disconnect
              </button>
            </div>
          )}
        </div>
      ) : activeIsParent ? (
        <button
          onClick={() => void handleConnect()}
          disabled={busy === 'connect'}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent-strong rounded-md disabled:opacity-50"
        >
          {busy === 'connect' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Calendar size={14} />
          )}
          Connect Google Calendar
        </button>
      ) : (
        <p className="text-sm text-text-muted italic">
          Only parents can connect Google Calendar.
        </p>
      )}
    </section>
  );
}
