import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  const label =
    mode === 'light'
      ? 'Light mode (tap for dark)'
      : mode === 'dark'
        ? 'Dark mode (tap for system)'
        : 'System mode (tap for light)';

  return (
    <button
      onClick={toggle}
      className="w-11 h-11 rounded-md bg-surface-2 hover:bg-surface flex items-center justify-center text-text-muted border border-border transition-colors"
      title={label}
      aria-label={label}
    >
      <Icon size={18} />
    </button>
  );
}
