import { useState } from 'react';
import { X, Mail, Loader2, CheckCircle2, Copy } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useFamily } from '@/context/FamilyContext';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultName?: string;
}

type State = 'idle' | 'loading' | 'success' | 'error';

export function InviteModal({ open, onClose, defaultName }: Props) {
  const { family, activeMember } = useFamily();
  const [email, setEmail] = useState('');
  const [name, setName] = useState(defaultName ?? '');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setEmail('');
    setName(defaultName ?? '');
    setState('idle');
    setErrorMsg('');
    setCopied(false);
    onClose();
  };

  const handleSend = async () => {
    if (!email.trim()) { setErrorMsg('Enter an email address.'); return; }
    if (!isSupabaseConfigured || !supabase) {
      setErrorMsg('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.');
      return;
    }

    setState('loading');
    setErrorMsg('');

    try {
      const { error } = await supabase.functions.invoke('send-invite', {
        body: {
          email: email.trim(),
          name: name.trim() || null,
          family_id: family.id,
          family_name: family.name,
          invited_by_name: activeMember?.name ?? 'A family member',
          site_url: window.location.origin
        }
      });

      if (error) throw new Error(error.message);
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const handleCopyLink = async () => {
    // Fallback: copy the app URL for manual sharing
    const url = window.location.origin;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Mail size={18} className="text-accent" />
            <h2 className="font-display text-lg text-text">Invite to family</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {state === 'success' ? (
            <div className="text-center py-4">
              <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
              <div className="font-medium text-text mb-1">Invitation sent!</div>
              <div className="text-sm text-text-faint">
                {email} will receive an email with a link to join {family.name}.
              </div>
              <button
                onClick={handleClose}
                className="mt-5 px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-text-faint mb-4 leading-relaxed">
                Enter the email address of the person you'd like to add to{' '}
                <span className="text-text font-medium">{family.name}</span>. They'll receive
                an invitation link to create their account.
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
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
                    disabled={state === 'loading'}
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                    placeholder="susan@example.com"
                    autoFocus
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
                    disabled={state === 'loading'}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="mt-3 text-sm text-red-500 bg-red-500/10 px-3 py-2.5 rounded-md leading-relaxed">
                  {errorMsg}
                </div>
              )}

              {/* Info note */}
              <div className="mt-4 p-3 bg-surface-2 rounded-lg text-xs text-text-faint leading-relaxed">
                <strong className="text-text-muted">How it works:</strong> The invitation is sent
                via email. The recipient clicks a secure link to create their account and join
                your family automatically.
              </div>

              <div className="flex items-center justify-between mt-5">
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 text-xs text-text-faint hover:text-text transition-colors"
                  title="Copy the app URL to share manually"
                >
                  <Copy size={12} />
                  {copied ? 'Copied!' : 'Copy app link'}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
                    disabled={state === 'loading'}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={state === 'loading' || !email.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  >
                    {state === 'loading' && <Loader2 size={14} className="animate-spin" />}
                    Send invitation
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
