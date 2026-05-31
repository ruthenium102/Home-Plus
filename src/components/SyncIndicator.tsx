import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFamily } from '@/context/FamilyContext';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Sync-status indicator shown in the TopBar. Mirrors the pattern used by
 * apps like Ledger: a small cloud icon that animates while syncing and
 * shows a "synced X ago" tooltip at rest. In demo mode (no Supabase) we
 * show a struck-through cloud to make it clear nothing is going to the
 * server.
 */
export function SyncIndicator() {
  const { reloading, lastReloadAt, reloadFromCloud, online } = useFamily();
  const [now, setNow] = useState(Date.now());

  // Tick the relative-time label every 15s while idle so the tooltip
  // doesn't read "1m ago" forever.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <span
        className="inline-flex items-center text-text-faint/60"
        title="Demo mode — changes saved on this device only"
        aria-label="Local only"
      >
        <CloudOff size={15} />
      </span>
    );
  }

  // Offline takes priority: writes are staying on the device until the
  // connection returns, so make that explicit rather than showing "synced".
  if (!online) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent-soft text-accent text-[11px] font-medium"
        title="You're offline — changes are saved on this device and will sync when you reconnect"
        aria-label="Offline — changes not synced"
      >
        <CloudOff size={13} />
        Offline
      </span>
    );
  }

  if (reloading) {
    return (
      <span className="inline-flex items-center text-accent" title="Syncing…" aria-label="Syncing">
        <RefreshCw size={15} className="animate-spin" />
      </span>
    );
  }

  const label = lastReloadAt > 0 ? `Synced ${formatAgo(now - lastReloadAt)}` : 'Synced';
  return (
    <button
      onClick={() => reloadFromCloud()}
      className="inline-flex items-center text-text-faint hover:text-accent transition-colors"
      title={label + ' · tap to refresh'}
      aria-label={label}
    >
      <Cloud size={15} />
    </button>
  );
}

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 30) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
