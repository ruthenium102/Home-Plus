import { memo } from 'react';
import {
  Home,
  Calendar,
  ListChecks,
  Sparkles,
  Trophy,
  ChefHat,
  Sun,
  PawPrint,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';

export type TabKey =
  | 'home'
  | 'calendar'
  | 'chores'
  | 'lists'
  | 'habits'
  | 'pet'
  | 'kitchen'
  | 'my-day'
  | 'settings';

export interface Tab {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

export interface TabVisibility {
  showMyDay?: boolean;
  showChores?: boolean;
  showHabits?: boolean;
  showPet?: boolean;
  showKitchen?: boolean;
}

interface Props extends TabVisibility {
  active: TabKey;
  onChange: (k: TabKey) => void;
}

/**
 * Single source of truth for which tabs are shown for a given member.
 * Used by both the bottom TabBar (phone) and the SideRail (iPad/desktop).
 */
export function buildTabList({
  showMyDay = false,
  showChores = true,
  showHabits = true,
  showPet = false,
  showKitchen = false,
}: TabVisibility): Tab[] {
  return [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'calendar', label: 'Calendar', icon: Calendar },
    ...(showMyDay ? [{ key: 'my-day' as TabKey, label: 'My Day', icon: Sun }] : []),
    ...(showChores ? [{ key: 'chores' as TabKey, label: 'Chores', icon: Trophy }] : []),
    { key: 'lists', label: 'Lists', icon: ListChecks },
    ...(showHabits ? [{ key: 'habits' as TabKey, label: 'Habits', icon: Sparkles }] : []),
    ...(showPet ? [{ key: 'pet' as TabKey, label: 'Pet', icon: PawPrint }] : []),
    ...(showKitchen ? [{ key: 'kitchen' as TabKey, label: 'Kitchen+', icon: ChefHat }] : []),
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
  ];
}

// Memoized: AppShell re-renders on every FamilyContext change, but TabBar's
// props (stable `onChange` + primitive visibility flags + `active`) rarely
// change, so memo skips the re-render and keeps tab switches smooth.
export const TabBar = memo(function TabBar({ active, onChange, ...visibility }: Props) {
  const tabs = buildTabList(visibility);

  // Buttons size to fit; min-h ≥44px for an iOS-friendly hit area. With 7+
  // tabs enabled, portrait phones drop to ~40pt per tab and every label
  // truncates to "Cal…"-style fragments — go icon-only there (labels return
  // at 480px+: landscape phones, tablets) and let aria-label/title carry the
  // name, like a dense native tab bar.
  const dense = tabs.length >= 7;
  return (
    <nav className="card p-1.5 flex gap-1">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            aria-label={t.label}
            title={t.label}
            aria-current={isActive ? 'page' : undefined}
            className={
              'flex-1 min-w-0 min-h-[48px] flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-md transition-[transform,background-color,color,box-shadow] active:scale-95 ' +
              (isActive
                ? 'bg-accent-strong text-white shadow-sm'
                : 'text-text-muted hover:bg-surface-2 hover:text-text')
            }
          >
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
            <span
              className={
                'text-xs font-medium truncate max-w-full' +
                (dense ? ' hidden min-[480px]:block' : '')
              }
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
});
