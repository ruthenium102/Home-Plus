import { memo } from 'react';
import { X } from 'lucide-react';
import { buildTabList, type TabKey, type TabVisibility } from './TabBar';

interface Props extends TabVisibility {
  active: TabKey;
  onChange: (k: TabKey) => void;
  /** Optional collapse handler — when set, a close button appears in the header. */
  onClose?: () => void;
  /** When false the rail slides off-screen left instead of unmounting. */
  open?: boolean;
}

/**
 * Left side navigation rail — shown when the user picks the 'side' dock
 * placement. Replaces the bottom TabBar at that size. Both are driven from
 * the same buildTabList() so adding a new tab updates both surfaces.
 *
 * It stays mounted while in side mode and slides in/out via a transform so the
 * open/close feels smooth (compositor-only, 60fps) rather than popping.
 */
export const SideRail = memo(function SideRail({
  active,
  onChange,
  onClose,
  open = true,
  ...visibility
}: Props) {
  const tabs = buildTabList(visibility);

  return (
    <nav
      aria-hidden={!open}
      className={
        'flex flex-col gap-1 fixed left-0 top-0 bottom-0 w-56 px-3 py-4 bg-surface border-r border-border z-30 overflow-y-auto ' +
        'transition-transform duration-300 ease-out will-change-transform ' +
        (open ? '' : 'pointer-events-none')
      }
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
      }}
    >
      <div className="flex items-center justify-between px-2 pb-3 mb-1 border-b border-border">
        <div className="text-xl font-display text-text">Home Plus</div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text"
            title="Collapse navigation"
            aria-label="Collapse navigation"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={
              'flex items-center gap-3 px-3 py-2.5 rounded-md transition-[transform,background-color,color,box-shadow] min-h-[44px] text-left ' +
              (isActive
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-muted hover:bg-surface-2 hover:text-text')
            }
          >
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} className="shrink-0" />
            <span className="text-sm font-medium truncate">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
});
