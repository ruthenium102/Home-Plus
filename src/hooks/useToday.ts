import { useEffect, useMemo, useState } from 'react';
import { localISO } from '@/lib/dates';

/**
 * The current local calendar day as a midnight-anchored Date whose identity
 * only changes when the day actually rolls over (checked every minute and on
 * visibilitychange, so a kitchen device left open overnight still flips).
 *
 * Use this instead of `new Date()` / `useMemo(() => new Date(), [])` anywhere
 * a component derives "today's" content — a frozen Date keeps showing
 * yesterday after midnight, and a bare `new Date()` only refreshes if
 * something else happens to re-render the component.
 */
export function useToday(): Date {
  const [iso, setIso] = useState(() => localISO());

  useEffect(() => {
    const check = () => setIso((cur) => (cur === localISO() ? cur : localISO()));
    const id = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return useMemo(() => new Date(`${iso}T00:00:00`), [iso]);
}

/**
 * Re-render ticker for within-day freshness (e.g. hiding events that have
 * already ended). Returns the current ms-epoch, updated every `intervalMs`
 * while visible and immediately on tab resume.
 */
export function useNowTick(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, intervalMs);
    const onVis = () => {
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);

  return now;
}
