import { GripVertical } from 'lucide-react';

/**
 * Standardised grip-handle affordance used on draggable list rows.
 * Visual only — the row itself is draggable so the user can grab anywhere,
 * but this gives the consistent vertical-lines hint on the LHS. We fade the
 * handle in only on row hover so it doesn't compete for attention at rest.
 */
export function DragHandle({ className = '' }: { className?: string }) {
  return (
    <span
      className={
        'shrink-0 text-text-faint/40 cursor-grab active:cursor-grabbing select-none ' +
        'opacity-50 hover:opacity-100 transition-opacity ' +
        className
      }
      aria-hidden
    >
      <GripVertical size={14} />
    </span>
  );
}
