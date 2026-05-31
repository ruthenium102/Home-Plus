import { CloudOff } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';

/**
 * Inline page-level banner shown when the device is offline. The TopBar's
 * SyncIndicator already flags offline globally, but on data-heavy pages
 * (MyDay, Kitchen) a local notice makes it clear that what you're seeing may
 * be stale and that edits will sync later. Renders nothing while online.
 */
export function OfflineNotice() {
  const { online } = useFamily();
  if (online) return null;

  return (
    <div className="mb-3 flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-accent">
      <CloudOff size={14} className="shrink-0" />
      <span>You're offline — showing the latest synced data. Changes will sync when you reconnect.</span>
    </div>
  );
}
