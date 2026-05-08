import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { storage } from '@/lib/storage';
import type { ThemeMode } from '@/types';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark'; // what's actually applied
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() =>
    storage.get<ThemeMode>('theme', 'system')
  );
  const [systemPref, setSystemPref] = useState<'light' | 'dark'>(getSystemPref);

  // Track system preference changes when in 'system' mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemPref(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? systemPref : mode;

  // Apply theme class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    // Update the meta theme-color so iOS/Android tinting matches
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#1a1815' : '#f8f4ed');
  }, [resolved]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    storage.set('theme', m);
  };

  const toggle = () => {
    // Cycle: light -> dark -> system -> light
    setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light');
  };

  const value = useMemo(() => ({ mode, resolved, setMode, toggle }), [mode, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
