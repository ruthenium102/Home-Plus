import { useState } from 'react';
import { Home, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type Mode = 'signin' | 'signup' | 'forgot';

export function AuthPage() {
  const { signIn, signUp, forgotPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const reset = (next: Mode) => {
    setMode(next);
    setError('');
    setResetSent(false);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'forgot') {
      if (!email.trim()) { setError('Enter your email address.'); return; }
      setLoading(true);
      const { error } = await forgotPassword(email.trim());
      setLoading(false);
      if (error) setError(error);
      else setResetSent(true);
      return;
    }

    if (mode === 'signin') {
      if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
      setLoading(true);
      const { error } = await signIn(email.trim(), password);
      setLoading(false);
      if (error) setError(error);
      return;
    }

    // signup
    if (!name.trim()) { setError('Enter your name.'); return; }
    if (!familyName.trim()) { setError('Enter a family name.'); return; }
    if (!email.trim()) { setError('Enter your email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }

    setLoading(true);
    const { error } = await signUp(email.trim(), password, name.trim(), familyName.trim());
    setLoading(false);
    // On success with email confirmations disabled (recommended for family apps),
    // onAuthStateChange fires immediately and AuthGate transitions to AppShell.
    // If error, show it inline.
    if (error) setError(error);
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
      {/* Brand header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-lg">
          <Home size={24} className="text-white" />
        </div>
        <div>
          <div className="font-display text-2xl text-text leading-tight">Home Plus</div>
          <div className="text-xs text-text-faint">Your family, organised</div>
        </div>
      </div>

      <div className="card w-full max-w-md">
        {/* Mode tabs */}
        {mode !== 'forgot' && (
          <div className="flex border-b border-border">
            <button
              onClick={() => reset('signin')}
              className={
                'flex-1 py-3 text-sm font-medium transition-colors ' +
                (mode === 'signin'
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text')
              }
            >
              Sign in
            </button>
            <button
              onClick={() => reset('signup')}
              className={
                'flex-1 py-3 text-sm font-medium transition-colors ' +
                (mode === 'signup'
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text')
              }
            >
              Create family
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'forgot' && (
            <div>
              <div className="font-display text-lg text-text mb-1">Reset password</div>
              <div className="text-sm text-text-faint">
                Enter your email and we'll send a reset link.
              </div>
            </div>
          )}

          {/* Name + family name — signup only */}
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs text-text-muted mb-1.5 font-medium">Your name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="given-name"
                  className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5 font-medium">Family name</label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="The Smith Family"
                  autoComplete="organization"
                  className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
                />
              </div>
            </>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
            />
          </div>

          {/* Password */}
          {mode !== 'forgot' && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5 font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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
          )}

          {/* Confirm password — signup only */}
          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5 font-medium">
                Confirm password
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
              />
            </div>
          )}

          {/* Error / confirmation */}
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2.5 rounded-md">
              {error}
            </div>
          )}
          {resetSent && (
            <div className="text-sm text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2.5 rounded-md">
              Reset link sent — check your inbox.
            </div>
          )}
          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-accent text-white text-sm font-semibold rounded-md hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === 'signin' && 'Sign in'}
            {mode === 'signup' && 'Create family account'}
            {mode === 'forgot' && 'Send reset link'}
          </button>

          {/* Footer links */}
          <div className="flex items-center justify-between text-xs text-text-faint pt-1">
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => reset('forgot')}
                className="hover:text-text underline underline-offset-2"
              >
                Forgot password?
              </button>
            )}
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => reset('signin')}
                className="hover:text-text underline underline-offset-2"
              >
                ← Back to sign in
              </button>
            )}
            {mode === 'signup' && (
              <span className="text-text-faint/80">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => reset('signin')}
                  className="text-accent underline underline-offset-2"
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </form>
      </div>

      <div className="mt-6 text-center text-xs text-text-faint/60">
        v{__APP_VERSION__} · Home Plus
      </div>
    </div>
  );
}
