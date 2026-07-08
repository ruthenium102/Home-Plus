import { useState } from 'react';
import { Mail, Loader2, CheckCircle2, Copy } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useFamily } from '@/context/FamilyContext';
import { Modal } from './Modal';
import type { Role } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultName?: string;
  defaultRole?: Role;
}

type State = 'idle' | 'loading' | 'success' | 'error';

interface InviteResult {
  token: string;
  acceptUrl: string;
  existing: boolean;
}

// Built on the shared Modal so the invite flow — often the very first thing a
// new family member's inviter touches — matches the app's modal language
// (bottom sheet on phones, safe-area-aware footer, shared entrance animation)
// instead of a hand-rolled centered dialog.
export function InviteModal({ open, onClose, defaultName, defaultRole = 'child' }: Props) {
  const { family, activeMember } = useFamily();
  const [email, setEmail] = useState('');
  const [name, setName] = useState(defaultName ?? '');
  const [role, setRole] = useState<Role>(defaultRole);
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    setEmail('');
    setName(defaultName ?? '');
    setRole(defaultRole);
    setState('idle');
    setErrorMsg('');
    setResult(null);
    setCopied(false);
    onClose();
  };

  const handleSend = async () => {
    if (!email.trim()) {
      setErrorMsg('Enter an email address.');
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setErrorMsg(
        'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.',
      );
      return;
    }

    setState('loading');
    setErrorMsg('');

    try {
      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: {
          email: email.trim(),
          name: name.trim() || null,
          role,
          family_id: family.id,
          family_name: family.name,
          invited_by_name: activeMember?.name ?? 'A family member',
          site_url: window.location.origin,
        },
      });

      if (error) throw new Error(error.message);

      const payload = data as
        | { ok?: boolean; token?: string; accept_url?: string; existing?: boolean; error?: string }
        | null;
      if (!payload || payload.error || !payload.token) {
        throw new Error(payload?.error || 'Invitation could not be created.');
      }
      setResult({
        token: payload.token,
        acceptUrl: payload.accept_url ?? `${window.location.origin}/accept-invite?token=${payload.token}`,
        existing: Boolean(payload.existing),
      });
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const handleCopyLink = async () => {
    const url = result?.acceptUrl ?? `${window.location.origin}/accept-invite`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      maxWidth="md"
      title={
        <span className="flex items-center gap-2.5">
          <Mail size={18} className="text-accent shrink-0" />
          Invite to family
        </span>
      }
      footer={
        state === 'success' ? undefined : (
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleClose}
              className="btn-ghost text-sm"
              disabled={state === 'loading'}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={state === 'loading' || !email.trim()}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {state === 'loading' && <Loader2 size={14} className="animate-spin" />}
              Send invitation
            </button>
          </div>
        )
      }
    >
      {state === 'success' && result ? (
        <div className="text-center py-4">
          <CheckCircle2 size={40} className="text-success mx-auto mb-3" />
          <div className="font-medium text-text mb-1">
            {result.existing ? 'They can sign in to join' : 'Invitation sent!'}
          </div>
          <div className="text-sm text-text-faint leading-relaxed">
            {result.existing ? (
              <>
                <span className="font-mono">{email}</span> already has a Home Plus account. Ask
                them to sign in — they'll be added to {family.name} automatically.
              </>
            ) : (
              <>{email} will receive an email with a link to join {family.name}.</>
            )}
          </div>
          <button
            onClick={handleCopyLink}
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-text-faint hover:text-text"
          >
            <Copy size={12} /> {copied ? 'Copied!' : 'Copy invite link'}
          </button>
          <div>
            <button onClick={handleClose} className="btn-primary mt-5 px-6 text-sm">
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-text-faint leading-relaxed">
            Enter the email address of the person you'd like to add to{' '}
            <span className="text-text font-medium">{family.name}</span>. They'll receive an
            invitation link to create their account.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1.5 font-medium">
                Their name <span className="text-text-faint font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Susan"
                className="input w-full"
                disabled={state === 'loading'}
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1.5 font-medium">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {(['parent', 'child'] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    disabled={state === 'loading'}
                    className={
                      'py-2 min-h-[44px] text-sm font-medium rounded-md border-2 transition-[transform,opacity,background-color,border-color,color,box-shadow] capitalize ' +
                      (role === r
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border text-text-muted hover:border-border-strong')
                    }
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1.5 font-medium">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="susan@example.com"
                autoFocus
                className="input w-full"
                disabled={state === 'loading'}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
            </div>
          </div>

          {errorMsg && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2.5 rounded-md leading-relaxed">
              {errorMsg}
            </div>
          )}

          {/* Info note */}
          <div className="p-3 bg-surface-2 rounded-lg text-xs text-text-faint leading-relaxed">
            <strong className="text-text-muted">How it works:</strong> The invitation is sent via
            email. The recipient clicks a secure link to create their account and join your family
            automatically.
          </div>
        </>
      )}
    </Modal>
  );
}
