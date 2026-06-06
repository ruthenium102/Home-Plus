/**
 * Insertion line shown on the row a dragged item will land next to. Rendered
 * INSIDE the (relatively positioned) row so it isn't clipped by an ancestor
 * `overflow-hidden` (e.g. SwipeableRow) the way an outer box-shadow line is.
 * `edge` is which side of the row the item will drop on.
 */
export function DropIndicator({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-1 z-30 h-[3px] rounded-full bg-accent"
      style={edge === 'top' ? { top: 1 } : { bottom: 1 }}
    >
      {/* Leading dot, the way native list reordering marks the insertion point. */}
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent" />
    </div>
  );
}
