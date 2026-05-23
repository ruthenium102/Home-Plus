import { buildTabList, type TabKey, type TabVisibility } from './TabBar';

interface Props extends TabVisibility {
  active: TabKey;
  onChange: (k: TabKey) => void;
}

/**
 * Left side navigation rail — shown at lg: breakpoint and up (iPad +
 * desktop). Replaces the bottom TabBar at that size. Both are driven from
 * the same buildTabList() so adding a new tab updates both surfaces.
 */
export function SideRail({ active, onChange, ...visibility }: Props) {
  const tabs = buildTabList(visibility);

  return (
    <nav
      className="hidden lg:flex flex-col gap-1 fixed left-0 top-0 bottom-0 w-56 px-3 py-4 bg-surface border-r border-border z-30 overflow-y-auto"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="text-xl font-display text-text px-2 pb-3 mb-1 border-b border-border">
        Home Plus
      </div>
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={
              'flex items-center gap-3 px-3 py-2.5 rounded-md transition-all min-h-[44px] text-left ' +
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
}
