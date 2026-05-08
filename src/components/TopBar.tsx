import { format } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  onSwitchUser: () => void;
}

export function TopBar({ onSwitchUser }: Props) {
  const { family, activeMember } = useFamily();
  const now = new Date();

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="text-xs tracking-widest uppercase text-text-faint mb-1">
          {family.name}
        </div>
        <div className="font-display text-2xl sm:text-3xl text-text leading-none">
          {format(now, 'EEEE, d MMM')}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Weather widget — placeholder for now, hooks up to real API in phase 2 */}
        <div className="hidden sm:block text-right pr-1">
          <div className="text-xl font-medium text-text leading-none">21°</div>
          <div className="text-xs text-text-faint">Perth · partly cloudy</div>
        </div>
        <ThemeToggle />
        {activeMember && (
          <button
            onClick={onSwitchUser}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors"
            title="Switch user"
          >
            <Avatar member={activeMember} size={36} showRing />
          </button>
        )}
      </div>
    </div>
  );
}
