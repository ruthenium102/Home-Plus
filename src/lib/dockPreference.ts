import { useEffect, useState } from 'react';

export type DockPlacement = 'floating' | 'side';

const KEY = 'dock_placement';
const DEFAULT: DockPlacement = 'floating';

// In-tab change subscribers — `storage` events only fire across tabs,
// so we dispatch our own CustomEvent for same-tab updates.
const EVENT = 'home-plus:dock-placement-change';

function read(): DockPlacement {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'side' ? 'side' : 'floating';
  } catch {
    return DEFAULT;
  }
}

function write(v: DockPlacement) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ignore (private mode, quota) */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

export function useDockPlacement(): [DockPlacement, (v: DockPlacement) => void] {
  const [placement, setPlacement] = useState<DockPlacement>(() => read());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const v = (e as CustomEvent<DockPlacement>).detail;
      if (v === 'side' || v === 'floating') setPlacement(v);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setPlacement(read());
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return [placement, write];
}
