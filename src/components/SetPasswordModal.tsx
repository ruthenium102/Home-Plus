import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  onDone: () => void;
}

export function SetPasswordModal({ onDone }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    const { error: err } = await supabase!.auth.updateUser({ password });
    setLoading(false);

    if (err) { setError(err.message); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="p-6">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-accent-soft flex items-center justify-center">
              <KeyRound size={22} className="text-accent" />
            </div>
          </div>
          <h2 className="font-display text-xl text-text text-center mb-1">Set your password</h2>
          <p className="text-sm text-text-faint text-center mb-5 leading-relaxed">
            You joined via an invite link. Set a password so you can sign in next time.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1.5 font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  autoFocus
                  className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1.5 font-medium">Confirm password</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
              />
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2.5 rounded-md">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="w-full py-3 bg-accent text-white text-sm font-semibold rounded-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Set password & continue
            </button>

            <button
              type="button"
              onClick={onDone}
              className="w-full text-center text-xs text-text-faint hover:text-text-muted py-1"
            >
              Skip for now
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
