/**
 * Edge auto-scroll for pointer-based drags.
 *
 * Our DnD interactions (`useListDragReorder`, `usePointerDragToDrop`, the
 * calendar event drag, and the chore-roster / meal-planner inline drags) set
 * `touch-action: none` and capture the pointer for the duration of a drag.
 * That deliberately stops the browser's native scroll so the page doesn't
 * fight the drag — but it also means that on a long list, the meal-planner
 * board, or the calendar grid the user can't reach a drop target that's
 * currently off-screen. This drives the nearest scrollable container under the
 * pointer when the pointer nears an edge, matching native list reordering (and
 * dnd-kit's auto-scroll) so off-screen targets become reachable on iPad.
 *
 * Usage:
 *   const autoScroll = createEdgeAutoScroller();
 *   // inside pointermove, once the drag has actually started:
 *   autoScroll.update(ev.clientX, ev.clientY);
 *   // inside cleanup / pointerup / pointercancel:
 *   autoScroll.stop();
 *
 * `update` lazily starts the rAF loop on first call; `stop` cancels it. It is
 * safe to call `update` on every move and `stop` more than once.
 */

export interface EdgeAutoScroller {
  /** Report the latest pointer position; starts the scroll loop on first call. */
  update(clientX: number, clientY: number): void;
  /** Stop scrolling and release the animation frame. Idempotent. */
  stop(): void;
}

// Distance (px) from a container edge within which auto-scroll engages.
const EDGE_ZONE = 72;
// Peak scroll speed (px per frame) reached at the very edge.
const MAX_SPEED = 16;

export function createEdgeAutoScroller(): EdgeAutoScroller {
  let rafId = 0;
  let px = 0;
  let py = 0;
  let running = false;

  // The nearest ancestor under the pointer that can actually scroll. We walk
  // the elementsFromPoint stack (the dragged row sits on top, but its parent
  // chain still leads to the real scroller) up to the document root.
  const findScrollable = (x: number, y: number): HTMLElement | null => {
    const stack = document.elementsFromPoint(x, y);
    for (const hit of stack) {
      let node: HTMLElement | null = hit as HTMLElement;
      while (node && node !== document.body && node !== document.documentElement) {
        const style = getComputedStyle(node);
        const scrollableY =
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight + 1;
        const scrollableX =
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth + 1;
        if (scrollableY || scrollableX) return node;
        node = node.parentElement;
      }
    }
    return null;
  };

  // Ease in (quadratic) so the scroll ramps up smoothly toward the very edge
  // rather than jumping to full speed the instant the zone is entered.
  const speedFor = (penetration: number): number => {
    const t = Math.min(1, Math.max(0, penetration / EDGE_ZONE));
    return Math.ceil(t * t * MAX_SPEED);
  };

  const tick = () => {
    rafId = 0;
    const el = findScrollable(px, py);
    if (el) {
      const rect = el.getBoundingClientRect();

      if (el.scrollHeight > el.clientHeight + 1) {
        const topPen = EDGE_ZONE - (py - rect.top);
        const botPen = EDGE_ZONE - (rect.bottom - py);
        if (topPen > 0 && el.scrollTop > 0) {
          el.scrollTop -= speedFor(topPen);
        } else if (botPen > 0 && el.scrollTop < el.scrollHeight - el.clientHeight) {
          el.scrollTop += speedFor(botPen);
        }
      }

      if (el.scrollWidth > el.clientWidth + 1) {
        const leftPen = EDGE_ZONE - (px - rect.left);
        const rightPen = EDGE_ZONE - (rect.right - px);
        if (leftPen > 0 && el.scrollLeft > 0) {
          el.scrollLeft -= speedFor(leftPen);
        } else if (rightPen > 0 && el.scrollLeft < el.scrollWidth - el.clientWidth) {
          el.scrollLeft += speedFor(rightPen);
        }
      }
    }
    if (running) rafId = requestAnimationFrame(tick);
  };

  return {
    update(clientX, clientY) {
      px = clientX;
      py = clientY;
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    },
    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
  };
}
