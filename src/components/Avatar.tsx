import { useTheme } from '@/context/ThemeContext';
import { getColorTokens } from '@/lib/colors';
import type { FamilyMember } from '@/types';

interface Props {
  member: FamilyMember;
  size?: number; // px
  showRing?: boolean;
  onClick?: () => void;
}

export function Avatar({ member, size = 40, showRing = false, onClick }: Props) {
  const { resolved } = useTheme();
  const tokens = getColorTokens(member.color, resolved === 'dark');
  const initial = member.name.charAt(0).toUpperCase();

  const styles: React.CSSProperties = {
    width: size,
    height: size,
    background: member.avatar_url ? undefined : tokens.base,
    color: tokens.text,
    fontSize: size * 0.4,
    boxShadow: showRing ? `0 0 0 3px ${tokens.base}` : undefined
  };

  const className = 'rounded-full flex items-center justify-center font-medium overflow-hidden flex-shrink-0';

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={className + ' transition-transform active:scale-95'}
        style={styles}
        aria-label={member.name}
      >
        {member.avatar_url ? (
          <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover" />
        ) : initial}
      </button>
    );
  }

  return (
    <div className={className} style={styles} aria-label={member.name}>
      {member.avatar_url ? (
        <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover" />
      ) : initial}
    </div>
  );
}
