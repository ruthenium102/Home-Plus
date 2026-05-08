import { format } from 'date-fns';
import { useTheme } from '@/context/ThemeContext';
import { useFamily } from '@/context/FamilyContext';
import { getColorTokens } from '@/lib/colors';
import type { ExpandedEvent } from '@/lib/recurrence';

interface Props {
  event: ExpandedEvent;
  onClick?: () => void;
  variant?: 'list' | 'week' | 'agenda';
}

/**
 * The colour of an event is derived from its first assigned member.
 * Whole-family events (no member_ids) use the accent.
 */
export function EventChip({ event, onClick, variant = 'list' }: Props) {
  const { resolved } = useTheme();
  const { members } = useFamily();
  const isDark = resolved === 'dark';

  const owner = event.member_ids[0]
    ? members.find((m) => m.id === event.member_ids[0])
    : null;

  const tokens = owner
    ? getColorTokens(owner.color, isDark)
    : { base: 'rgb(var(--accent))', soft: 'rgb(var(--accent-soft))', text: '#fff' };

  const start = new Date(event.occurrence_start);
  const end = new Date(event.occurrence_end);
  const timeLabel = event.all_day
    ? 'All day'
    : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;

  if (variant === 'list') {
    return (
      <button
        onClick={onClick}
        className="w-full text-left grid grid-cols-[60px_4px_1fr] gap-3 items-stretch py-2.5 px-1 hover:bg-surface-2 rounded-md transition-colors"
      >
        <div className="text-sm text-text-muted tabular-nums pt-0.5">
          {event.all_day ? '—' : format(start, 'HH:mm')}
        </div>
        <div
          className="rounded-sm self-stretch min-h-[36px]"
          style={{ background: tokens.base }}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-text truncate">{event.title}</div>
          <div className="text-xs text-text-faint truncate">
            {owner ? owner.name : 'Family'}
            {event.location && ` · ${event.location}`}
            {!event.all_day && ` · ${timeLabel}`}
          </div>
        </div>
      </button>
    );
  }

  // Week variant — compact pill
  return (
    <button
      onClick={onClick}
      className="block w-full text-left rounded-sm px-1.5 py-1 mb-1 transition-opacity hover:opacity-90"
      style={{
        background: tokens.soft,
        borderLeft: `3px solid ${tokens.base}`,
        color: 'rgb(var(--text))'
      }}
    >
      <div className="text-[11px] font-medium truncate">{event.title}</div>
      {!event.all_day && (
        <div className="text-[10px] opacity-70 tabular-nums">{format(start, 'HH:mm')}</div>
      )}
    </button>
  );
}
