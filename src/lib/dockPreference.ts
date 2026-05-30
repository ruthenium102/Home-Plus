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

// Open/closed state of the side rail. Persists alongside the placement
// preference so toggling open/closed survives reloads. Defaults to open.

const RAIL_OPEN_KEY = 'side_rail_open';
const RAIL_OPEN_EVENT = 'home-plus:side-rail-open-change';

function readRailOpen(): boolean {
  try {
    return localStorage.getItem(RAIL_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeRailOpen(v: boolean) {
  try {
    localStorage.setItem(RAIL_OPEN_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(RAIL_OPEN_EVENT, { detail: v }));
}

export function useSideRailOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => readRailOpen());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const v = (e as CustomEvent<boolean>).detail;
      setOpen(Boolean(v));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === RAIL_OPEN_KEY) setOpen(readRailOpen());
    };
    window.addEventListener(RAIL_OPEN_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RAIL_OPEN_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return [open, writeRailOpen];
}
