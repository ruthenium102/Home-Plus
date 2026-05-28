import { useEffect, useState } from 'react';

/**
 * True when the viewport is narrower than Tailwind's `sm` breakpoint (640px).
 * Use this to switch layouts that need more than a CSS-only breakpoint —
 * e.g. rendering a 3-day calendar window instead of a 7-day week, or moving
 * navigation step sizes.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 639px)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isPhone;
}
