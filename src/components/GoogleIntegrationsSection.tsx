import { useCallback, useEffect, useState } from 'react';
import { Calendar, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useFamily } from '@/context/FamilyContext';

interface IntegrationRow {
  family_member_id: string;
  member_name: string;
  google_account_email: string;
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
  const { family, members, activeMember } = useFamily();
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_family_google_integrations', {
      p_family_id: family.id,
    });
    if (!error && data) setRows(data as IntegrationRow[]);
  }, [family.id]);

  // Initial load + realtime subscription so a disconnect on another device
  // updates this UI without a refresh.
  useEffect(() => {
    void refresh();
    if (!supabase) return;
    const ch = supabase
      .channel(`gci-${family.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'google_calendar_integrations', filter: `family_id=eq.${family.id}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(ch);
    };
  }, [family.id, refresh]);

  // Handle the post-OAuth redirect banner. The callback endpoint redirects
  // back to /settings?google=connected or ?google=error&reason=...
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

  const parents = members.filter((m) => m.role === 'parent');
  const activeIsParent = activeMember?.role === 'parent';

  const handleConnect = useCallback(async () => {
    if (!activeMember) return;
    setBusyMember(activeMember.id);
    try {
      const res = await authedFetch('/api/google/auth-init', {
        family_member_id: activeMember.id,
      });
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
      setBusyMember(null);
    }
  }, [activeMember]);

  const handleDisconnect = useCallback(
    async (memberId: string) => {
      setBusyMember(memberId);
      try {
        const res = await authedFetch('/api/google/disconnect', {
          family_member_id: memberId,
        });
        if (!res || !res.ok) {
          const msg = res ? (await res.json().catch(() => ({}))).error || res.statusText : 'Not signed in';
          setBanner({ kind: 'error', text: `Disconnect failed: ${msg}` });
          return;
        }
        setBanner({ kind: 'success', text: 'Disconnected.' });
        await refresh();
      } finally {
        setBusyMember(null);
      }
    },
    [refresh],
  );

  const handleReconcile = useCallback(async () => {
    setBusyMember('__reconcile__');
    try {
      const res = await authedFetch('/api/google/reconcile', { family_id: family.id });
      if (res?.ok) {
        setBanner({ kind: 'success', text: 'Synced.' });
        await refresh();
      } else {
        setBanner({ kind: 'error', text: 'Sync failed.' });
      }
    } finally {
      setBusyMember(null);
    }
  }, [family.id, refresh]);

  if (parents.length === 0) return null;

  const activeRow = activeMember
    ? rows.find((r) => r.family_member_id === activeMember.id)
    : undefined;

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h2 className="font-display text-lg text-text flex items-center gap-2">
          <Calendar size={16} className="text-accent" /> Google Calendar
        </h2>
        {rows.length > 0 && (
          <button
            onClick={handleReconcile}
            disabled={busyMember === '__reconcile__'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-text rounded-md hover:bg-surface-2 disabled:opacity-50"
            title="Pull the latest from Google"
          >
            {busyMember === '__reconcile__' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Sync now
          </button>
        )}
      </div>
      <p className="text-sm text-text-muted mb-4">
        Optional 2-way sync. When a parent connects, we create a dedicated
        <em> Home Plus &ndash; {family.name}</em> calendar in their Google
        account &mdash; we never touch their personal calendars. Other family
        members can subscribe to it from Google Calendar.
      </p>

      {banner && (
        <div
          className={`text-sm rounded-md px-3 py-2 mb-3 ${
            banner.kind === 'success'
              ? 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200'
              : 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200'
          }`}
        >
          {banner.text}
        </div>
      )}

      <ul className="space-y-2">
        {parents.map((p) => {
          const row = rows.find((r) => r.family_member_id === p.id);
          const isMe = activeMember?.id === p.id;
          return (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md bg-surface-2 border border-border"
            >
              <div className="min-w-0">
                <div className="text-sm text-text">{p.name}</div>
                {row ? (
                  <div className="text-xs text-text-muted truncate">
                    {row.google_account_email}
                    {' · last sync '}
                    {timeAgo(row.last_synced_at)}
                    {row.last_sync_error && (
                      <span className="text-red-600 dark:text-red-400">
                        {' · '}
                        {row.last_sync_error}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-text-muted">Not connected</div>
                )}
              </div>
              <div className="shrink-0">
                {row && isMe ? (
                  <button
                    onClick={() => void handleDisconnect(p.id)}
                    disabled={busyMember === p.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-text bg-surface border border-border rounded-md disabled:opacity-50"
                  >
                    {busyMember === p.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Unplug size={12} />
                    )}
                    Disconnect
                  </button>
                ) : !row && isMe && activeIsParent ? (
                  <button
                    onClick={() => void handleConnect()}
                    disabled={busyMember === p.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-accent rounded-md disabled:opacity-50"
                  >
                    {busyMember === p.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Calendar size={12} />
                    )}
                    Connect
                  </button>
                ) : (
                  <span className="text-xs text-text-muted italic">
                    {row ? '' : 'awaiting them'}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!activeIsParent && (
        <p className="text-xs text-text-muted mt-3 italic">
          Only parents can connect Google Calendar.
        </p>
      )}
      {activeIsParent && !activeRow && (
        <p className="text-xs text-text-muted mt-3">
          When you connect, we'll open a Google sign-in window and ask for
          calendar access only — no email or contacts.
        </p>
      )}
    </section>
  );
}
