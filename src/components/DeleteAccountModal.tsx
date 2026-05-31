import { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { apiUrl } from '@/lib/apiBase';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Typed-confirmation modal for permanent account deletion (L3 / R5).
 *
 * The user must type their family name (or the literal word DELETE) before the
 * destructive button enables. On confirm it POSTs to /api/account/delete with
 * the session Bearer token, then signs out and returns to the auth screen. The
 * server derives the user id from the token and cascades the data + auth user.
 */
export function DeleteAccountModal({ open, onClose }: Props) {
  const { family, signOut } = useFamily();
  const { authSignOut } = useAuth();
  const { show } = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  // Accept the family name (case-insensitive) or the literal word DELETE.
  const confirmTarget = family.name.trim();
  const confirmed =
    typed.trim().length > 0 &&
    (typed.trim().toLowerCase() === confirmTarget.toLowerCase() ||
      typed.trim().toUpperCase() === 'DELETE');

  const handleClose = () => {
    if (busy) return;
    setTyped('');
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data: sessionData } = (await supabase?.auth.getSession()) ?? {
        data: { session: null },
      };
      const token = sessionData.session?.access_token;
      if (!token) {
        setError('Your session has expired. Sign in again and retry.');
        setBusy(false);
        return;
      }

      const res = await fetch(apiUrl('/api/account/delete'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        let message = `Delete failed (${res.status})`;
        try {
          const json = await res.json();
          if (json?.error) message = json.error;
        } catch {
          /* keep default */
        }
        setError(message);
        setBusy(false);
        return;
      }

      // Account + data are gone server-side. Clear local member session and the
      // Supabase auth session, then drop back to the auth screen.
      signOut();
      await authSignOut();
      show({ message: 'Your account and data have been deleted.', duration: 6000 });
      // Modal unmounts with the app returning to the auth screen.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <div className="font-display text-lg text-text">Delete account</div>
              <div className="text-xs text-text-faint">This can't be undone</div>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={busy}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-sm text-text-muted leading-relaxed mb-4 space-y-2">
          <p>
            This permanently deletes your login and all data for{' '}
            <span className="font-semibold text-text">{family.name}</span> — every member, event,
            list, chore, habit, reward and recipe. If other parents share this family, only your own
            membership is removed and the family stays for them.
          </p>
          <p>
            To confirm, type your family name{' '}
            <span className="font-semibold text-text">{family.name}</span> (or the word{' '}
            <span className="font-mono font-semibold text-text">DELETE</span>) below.
          </p>
        </div>

        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && confirmed) handleDelete();
          }}
          placeholder={family.name}
          disabled={busy}
          className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-red-500 mb-3"
        />

        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-md mb-3">{error}</div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-md border border-border text-text-muted text-sm hover:bg-surface-2 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Deleting…
              </>
            ) : (
              'Delete account'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
