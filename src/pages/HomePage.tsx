import { useMemo } from 'react';
import { endOfDay, isAfter, startOfDay } from 'date-fns';
import { Sparkles, Bell, ListChecks, Flame } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { expandEvents } from '@/lib/recurrence';
import { MemberStrip } from '@/components/MemberStrip';
import { EventChip } from '@/components/EventChip';
import { Avatar } from '@/components/Avatar';
import { SwipeableRow } from '@/components/SwipeableRow';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { getColorTokens } from '@/lib/colors';
import { isParent, formatBalance } from '@/lib/chores';
import { isDueSoon, isOverdue, formatDue, visibleLists } from '@/lib/lists';
import { computeHabitStreak, isCheckedIn, visibleHabits, isHabitDue } from '@/lib/habits';
import type { TabKey } from '@/components/TabBar';

interface Props {
  onNavigate: (tab: TabKey) => void;
}

export function HomePage({ onNavigate }: Props) {
  const {
    events,
    members,
    goals,
    completions,
    redemptions,
    lists,
    listItems,
    habits,
    checkIns,
    activeMember,
    deleteEvent,
    addEvent
  } = useFamily();
  const { resolved } = useTheme();
  const { show } = useToast();
  const swipeMode = useSwipeMode();

  // Soft-delete an event with undo support.
  // For recurring events this removes the entire series — for one-offs, just that one.
  const handleDeleteEvent = (eventId: string, title: string) => {
    const original = events.find((e) => e.id === eventId);
    if (!original) return;
    deleteEvent(eventId);
    show({
      message: `"${title}" deleted`,
      onUndo: () => {
        addEvent({
          title: original.title,
          description: original.description,
          start_at: original.start_at,
          end_at: original.end_at,
          all_day: original.all_day,
          location: original.location,
          category: original.category,
          member_ids: original.member_ids,
          recurrence: original.recurrence,
          reminder_offsets: original.reminder_offsets,
          created_by: original.created_by
        });
      }
    });
  };

  const today = new Date();
  const todays = useMemo(() => {
    const expanded = expandEvents(events, startOfDay(today), endOfDay(today));
    return expanded.filter((e) => isAfter(new Date(e.occurrence_end), new Date()));
  }, [events]);

  const kids = members
    .filter((m) => m.role === 'child')
    .sort((a, b) => (b.reward_balances.stars || 0) - (a.reward_balances.stars || 0));

  const pendingApprovals =
    completions.filter((c) => c.status === 'pending_approval').length +
    redemptions.filter((r) => r.status === 'pending_approval').length;

  // Due-soon list items, scoped to what the active member can see
  const dueItems = useMemo(() => {
    if (!activeMember) return [];
    const visible = visibleLists(lists, activeMember.id);
    const visibleListIds = new Set(visible.map((l) => l.id));
    return listItems
      .filter((i) => visibleListIds.has(i.list_id))
      .filter((i) => !i.done && (isDueSoon(i, 7) || isOverdue(i)))
      .sort((a, b) => {
        const aDue = a.next_due || a.due_date || '9999-12-31';
        const bDue = b.next_due || b.due_date || '9999-12-31';
        return aDue.localeCompare(bDue);
      })
      .slice(0, 4);
  }, [activeMember, lists, listItems]);

  // Today's habits for active member
  const myHabitsToday = useMemo(() => {
    if (!activeMember) return [];
    return visibleHabits(habits, activeMember.id)
      .filter((h) => h.member_id === activeMember.id && isHabitDue(h, today))
      .map((h) => ({
        habit: h,
        checked: isCheckedIn(checkIns, h.id, activeMember.id, today),
        streak: computeHabitStreak(checkIns, h.id, activeMember.id)
      }));
  }, [activeMember, habits, checkIns, today]);

  return (
    <div className="space-y-5">
      <MemberStrip />

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        {/* Today's schedule */}
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-xl text-text">Today</h2>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs text-text-muted hover:text-accent uppercase tracking-wider"
            >
              Full calendar →
            </button>
          </div>
          {todays.length === 0 ? (
            <div className="py-8 text-center">
              <div className="text-text-faint mb-1">Nothing left today</div>
              <button
                onClick={() => onNavigate('calendar')}
                className="text-sm text-accent hover:underline"
              >
                Plan something →
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {todays.map((e) => (
                <SwipeableRow
                  key={e.occurrence_key}
                  mode={swipeMode}
                  onDelete={() => handleDeleteEvent(e.id, e.title)}
                >
                  <EventChip
                    event={e}
                    onClick={() => onNavigate('calendar')}
                  />
                </SwipeableRow>
              ))}
            </div>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-4">
          {/* Today's habits (own only) */}
          {myHabitsToday.length > 0 && (
            <div className="card p-4">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-xs uppercase tracking-wider text-text-faint">
                  Your habits today
                </div>
                <button
                  onClick={() => onNavigate('habits')}
                  className="text-[10px] uppercase tracking-wider text-text-muted hover:text-accent"
                >
                  All →
                </button>
              </div>
              <div className="space-y-2">
                {myHabitsToday.map(({ habit, checked, streak }) => (
                  <button
                    key={habit.id}
                    onClick={() => onNavigate('habits')}
                    className="w-full flex items-center gap-2.5 p-2 rounded-md hover:bg-surface-2/50 text-left transition-colors"
                  >
                    <div
                      className={
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ' +
                        (checked
                          ? 'bg-accent border-accent'
                          : 'border-text-faint')
                      }
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 24 24"
                          width="11"
                          height="11"
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={
                          'text-sm truncate ' +
                          (checked ? 'text-text-muted' : 'text-text')
                        }
                      >
                        {habit.title}
                      </div>
                    </div>
                    {streak > 0 && (
                      <div className="flex items-center gap-1 text-xs text-text-faint shrink-0">
                        <Flame size={11} className="text-accent" />
                        <span className="tabular-nums">{streak}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Lists due soon */}
          {dueItems.length > 0 && (
            <div className="card p-4">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-xs uppercase tracking-wider text-text-faint">
                  Coming up
                </div>
                <button
                  onClick={() => onNavigate('lists')}
                  className="text-[10px] uppercase tracking-wider text-text-muted hover:text-accent"
                >
                  Lists →
                </button>
              </div>
              <div className="space-y-1.5">
                {dueItems.map((item) => {
                  const overdue = isOverdue(item);
                  const due = item.next_due || item.due_date;
                  const list = lists.find((l) => l.id === item.list_id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate('lists')}
                      className="w-full flex items-center gap-2.5 text-left"
                    >
                      <ListChecks
                        size={13}
                        className={overdue ? 'text-accent' : 'text-text-faint'}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text truncate">{item.title}</div>
                        <div className="text-[10px] text-text-faint truncate">
                          {list?.name} · {formatDue(due)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Parent approvals card */}
          {isParent(activeMember) && pendingApprovals > 0 && (
            <button
              onClick={() => onNavigate('chores')}
              className="card p-4 w-full text-left border-accent/40 bg-accent-soft/30 hover:bg-accent-soft transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Bell size={14} className="text-accent" />
                <div className="text-[11px] uppercase tracking-widest text-accent font-semibold">
                  {pendingApprovals} waiting for you
                </div>
              </div>
              <div className="text-sm text-text">
                Tap to review chore completions and spending requests.
              </div>
            </button>
          )}

          {/* Rewards leaderboard */}
          <div className="card p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs uppercase tracking-wider text-text-faint">
                Stars this week
              </div>
              <button
                onClick={() => onNavigate('chores')}
                className="text-[10px] uppercase tracking-wider text-text-muted hover:text-accent"
              >
                Chores →
              </button>
            </div>
            <div className="space-y-3">
              {kids.length === 0 ? (
                <div className="text-sm text-text-faint">
                  Add a child to start tracking rewards
                </div>
              ) : (
                kids.map((kid) => {
                  const tokens = getColorTokens(kid.color, resolved === 'dark');
                  const stars = kid.reward_balances.stars || 0;
                  const goal = goals.find(
                    (g) => g.member_id === kid.id && !g.achieved_at
                  );
                  const goalAmount = goal?.target_amount || 200;
                  const goalProgress = goal
                    ? (kid.reward_balances[goal.category] || 0) / goalAmount
                    : stars / 200;
                  const pct = Math.min(100, goalProgress * 100);

                  return (
                    <div key={kid.id} className="flex items-center gap-2.5">
                      <Avatar member={kid} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-text truncate">{kid.name}</span>
                          <span
                            className="font-medium tabular-nums shrink-0"
                            style={{ color: tokens.base }}
                          >
                            ★ {stars}
                          </span>
                        </div>
                        <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: tokens.base }}
                          />
                        </div>
                        {goal && (
                          <div className="text-[10px] text-text-faint mt-0.5 truncate">
                            {goal.title} · {formatBalance(goal.category, kid.reward_balances[goal.category] || 0)} / {formatBalance(goal.category, goal.target_amount)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* AI suggestion card */}
          <AISuggestion />
        </div>
      </div>
    </div>
  );
}

function AISuggestion() {
  // Placeholder — phase 5 will wire this to a real Claude API call.
  return (
    <div className="rounded-lg p-4 bg-gradient-to-br from-surface-2 to-surface border border-border-strong">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
          <Sparkles size={11} className="text-white" />
        </div>
        <div className="text-[11px] uppercase tracking-widest text-accent font-medium">
          AI suggests
        </div>
      </div>
      <div className="text-sm text-text leading-relaxed mb-3">
        Henry's been on a roll — 5 chores done this week. Worth a high-five at dinner.
      </div>
      <div className="flex gap-2">
        <button className="flex-1 px-3 py-2 bg-accent text-white text-xs font-medium rounded-md hover:opacity-90">
          Got it
        </button>
        <button className="flex-1 px-3 py-2 border border-border text-text-muted text-xs rounded-md hover:bg-surface-2">
          Dismiss
        </button>
      </div>
    </div>
  );
}
