import { useCallback, useRef, useState } from 'react';
import { createEdgeAutoScroller } from '@/lib/dragAutoScroll';

/**
 * Pointer-based "drag a source onto a drop zone" helper. HTML5 drag-and-drop
 * (`draggable` / `onDragStart` / `onDrop`) is effectively non-functional on iOS
 * touch, so this captures the pointer instead, watches `pointermove` for the
 * drop target under the finger/cursor (found by walking up to an element
 * carrying `data-{dropAttr}`), and commits on `pointerup`. Works with both
 * touch and mouse.
 *
 * Modelled on the Calendar event-drag implementation (`CalendarPage` /
 * `startEventDrag`) and the `useListDragReorder` hook, generalised so any
 * "drag chip → drop target" interaction can share it.
 *
 * Usage:
 *   const drag = usePointerDragToDrop<string>({
 *     dropAttr: 'pet-drop',
 *     onDrop: (payload, dropId) => feed(payload),
 *     onOverChange: (dropId) => setHot(dropId !== null),
 *   });
 *   // on the draggable source:
 *   <div onPointerDown={(e) => drag.start(payload, e)} />
 *   // on the drop zone:
 *   <div data-pet-drop="treat" />
 *
 * A small movement threshold prevents a plain tap from starting a drag.
 */
export interface PointerDragToDrop<P> {
  /** Begin a potential drag with the given payload from a pointerdown. */
  start: (payload: P, downEv: React.PointerEvent) => void;
  /** True while a drag gesture is actively in progress. */
  isDragging: boolean;
  /** Data attribute key of the drop target currently under the pointer, or null. */
  overDropId: string | null;
}

interface Options<P> {
  /** The `data-*` attribute (without the `data-` prefix) that marks drop zones. */
  dropAttr: string;
  /** Called once on a successful drop with the payload + the drop zone's id. */
  onDrop: (payload: P, dropId: string, clientX: number, clientY: number) => void;
  /** Called whenever the hovered drop zone id changes (incl. to null). */
  onOverChange?: (dropId: string | null) => void;
  /** Movement (px) before a press becomes a drag. Defaults to 6. */
  threshold?: number;
}

export function usePointerDragToDrop<P>({
  dropAttr,
  onDrop,
  onOverChange,
  threshold = 6,
}: Options<P>): PointerDragToDrop<P> {
  const [isDragging, setIsDragging] = useState(false);
  const [overDropId, setOverDropId] = useState<string | null>(null);
  const datasetKey = dropAttrToDatasetKey(dropAttr);
  // Edge auto-scroll so a drop target below the fold stays reachable while the
  // pointer is captured (which suppresses native scroll during the drag).
  const autoScrollRef = useRef(createEdgeAutoScroller());

  const findDropAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const zone = (el as HTMLElement).closest?.(`[data-${dropAttr}]`) as HTMLElement | null;
        if (zone) return zone.dataset[datasetKey] ?? null;
      }
      return null;
    },
    [dropAttr, datasetKey],
  );

  const setOver = useCallback(
    (id: string | null) => {
      setOverDropId((cur) => (cur === id ? cur : id));
      onOverChange?.(id);
    },
    [onOverChange],
  );

  const start = useCallback(
    (payload: P, downEv: React.PointerEvent) => {
      if (downEv.button !== undefined && downEv.button !== 0) return;
      const target = downEv.currentTarget as HTMLElement;
      const startX = downEv.clientX;
      const startY = downEv.clientY;
      const pointerId = downEv.pointerId;
      let started = false;

      const move = (ev: PointerEvent) => {
        if (!started) {
          if (Math.abs(ev.clientY - startY) < threshold && Math.abs(ev.clientX - startX) < threshold)
            return;
          started = true;
          try {
            target.setPointerCapture(pointerId);
          } catch {
            /* ignore */
          }
          setIsDragging(true);
        }
        autoScrollRef.current.update(ev.clientX, ev.clientY);
        setOver(findDropAt(ev.clientX, ev.clientY));
        ev.preventDefault();
      };

      const cleanup = () => {
        autoScrollRef.current.stop();
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', cancel);
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        setIsDragging(false);
        setOver(null);
      };

      const up = (ev: PointerEvent) => {
        const wasStarted = started;
        const dropId = findDropAt(ev.clientX, ev.clientY);
        cleanup();
        if (wasStarted && dropId) onDrop(payload, dropId, ev.clientX, ev.clientY);
      };

      const cancel = () => cleanup();

      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', cancel);
    },
    [findDropAt, onDrop, setOver, threshold],
  );

  return { start, isDragging, overDropId };
}

/** `'pet-drop'` → `'petDrop'` (how the browser exposes it on `dataset`). */
function dropAttrToDatasetKey(attr: string): string {
  return attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
