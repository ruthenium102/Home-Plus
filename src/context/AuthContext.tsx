import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True only while the initial session check is in-flight (Supabase mode only). */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  /**
   * Create a new family account. After email confirmation the user lands back
   * in the app with their session and user_metadata.{name, family_name} set.
   */
  signUp: (
    email: string,
    password: string,
    name: string,
    familyName: string
  ) => Promise<{ error?: string }>;
  /** Sign completely out of Supabase Auth (not just the in-app member switch). */
  authSignOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Start loading=true only if Supabase is wired up; demo mode skips this.
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    familyName: string
  ): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, family_name: familyName } }
    });
    return error ? { error: error.message } : {};
  };

  const authSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const forgotPassword = async (email: string): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}?reset=1`
    });
    return error ? { error: error.message } : {};
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signIn,
        signUp,
        authSignOut,
        forgotPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
