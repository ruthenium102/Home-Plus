import {
  Home,
  Calendar,
  ListChecks,
  Sparkles,
  Trophy,
  ChefHat,
  Sun,
  Settings as SettingsIcon,
  type LucideIcon
} from 'lucide-react';

export type TabKey =
  | 'home'
  | 'calendar'
  | 'chores'
  | 'lists'
  | 'habits'
  | 'kitchen'
  | 'my-day'
  | 'settings';

interface Tab {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

interface Props {
  active: TabKey;
  onChange: (k: TabKey) => void;
  showMyDay?: boolean;
  showChores?: boolean;
  showHabits?: boolean;
  showKitchen?: boolean;
}

export function TabBar({
  active,
  onChange,
  showMyDay = false,
  showChores = true,
  showHabits = true,
  showKitchen = false
}: Props) {
  const tabs: Tab[] = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'calendar', label: 'Calendar', icon: Calendar },
    ...(showMyDay ? [{ key: 'my-day' as TabKey, label: 'My Day', icon: Sun }] : []),
    ...(showChores ? [{ key: 'chores' as TabKey, label: 'Chores', icon: Trophy }] : []),
    { key: 'lists', label: 'Lists', icon: ListChecks },
    ...(showHabits ? [{ key: 'habits' as TabKey, label: 'Habits', icon: Sparkles }] : []),
    ...(showKitchen ? [{ key: 'kitchen' as TabKey, label: 'Kitchen+', icon: ChefHat }] : []),
    { key: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

  return (
    <nav className="card p-1.5 flex gap-1 overflow-x-auto scroll-x-clean">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={
              'flex-1 min-w-[68px] flex flex-col items-center gap-1 px-2 py-2.5 rounded-md transition-all active:scale-95 ' +
              (isActive
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-muted hover:bg-surface-2 hover:text-text')
            }
          >
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
            <span className="text-[11px] font-medium">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
