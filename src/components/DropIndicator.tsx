/**
 * Insertion line shown where a dragged item will land. Render it inside a
 * `relative` wrapper that is NOT inside an `overflow-hidden` ancestor (e.g.
 * place it as a sibling of SwipeableRow, not inside it) — otherwise it gets
 * clipped. It straddles the row edge (centred on the boundary) so the line +
 * leading dot sit in the gap between rows, the way native list reordering
 * marks the drop point. `edge` is which side of the row the item drops on.
 */
export function DropIndicator({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      className={
        'pointer-events-none absolute inset-x-1 z-30 h-[3px] rounded-full bg-accent ' +
        (edge === 'top' ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2')
      }
    >
      {/* Leading dot, the way native list reordering marks the insertion point. */}
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent" />
    </div>
  );
}
