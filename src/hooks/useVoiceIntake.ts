import { useCallback } from 'react';
import { useFamily } from '@/context/FamilyContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { apiUrl } from '@/lib/apiBase';
import { localISO } from '@/lib/dates';
import type { ChoreFrequency, EventCategory, FamilyMember } from '@/types';

/** Action shapes returned by /api/voice-intake. */
type VoiceAction =
  | {
      kind: 'add_list_item';
      list_id: string;
      title: string;
      due_date?: string | null;
      assigned_to?: string | null;
    }
  | {
      kind: 'add_event';
      title: string;
      start_at: string;
      end_at: string;
      all_day: boolean;
      member_ids: string[];
      category: EventCategory;
      location?: string | null;
      description?: string | null;
    }
  | { kind: 'log_habit'; habit_id: string; for_date: string }
  | { kind: 'set_status'; member_id: string; location: string; until?: string | null }
  | {
      kind: 'add_chore';
      title: string;
      assigned_to: string[];
      frequency: ChoreFrequency;
      weekdays: number[];
    }
  | { kind: 'unknown'; reason: string };

export function useVoiceIntake() {
  const {
    family,
    members,
    activeMember,
    lists,
    listItems,
    habits,
    chores,
    addEvent,
    deleteEvent,
    addListItem,
    deleteListItem,
    addChore,
    deleteChore,
    incrementCheckIn,
    decrementCheckIn,
    setMemberLocation,
  } = useFamily();
  const { show } = useToast();

  const memberById = useCallback(
    (id: string): FamilyMember | undefined => members.find((m) => m.id === id),
    [members],
  );

  /**
   * Send a transcript to /api/voice-intake, then route the parsed action to
   * the right FamilyContext mutator and surface an undo-able toast.
   */
  const dispatch = useCallback(
    async (transcript: string) => {
      // The serverless route now requires a Supabase session and builds the
      // family context itself — we only send identifiers, not the data.
      const { data: sessionData } = (await supabase?.auth.getSession()) ?? {
        data: { session: null },
      };
      const token = sessionData.session?.access_token;
      if (!token) {
        show({ message: 'Sign in to use voice', duration: 4000 });
        return;
      }

      let action: VoiceAction;
      try {
        const res = await fetch(apiUrl('/api/voice-intake'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            transcript,
            family_id: family.id,
            active_member_id: activeMember?.id ?? null,
          }),
        });
        if (!res.ok) {
          show({ message: `Voice failed: ${res.status}`, duration: 4000 });
          return;
        }
        const json = await res.json();
        action = json.action as VoiceAction;
      } catch (err) {
        show({
          message: 'Voice failed: ' + (err instanceof Error ? err.message : String(err)),
          duration: 4000,
        });
        return;
      }

      // Active member is required for almost every action — bail early without.
      if (!activeMember && action.kind !== 'unknown') {
        show({ message: 'Sign in first', duration: 3000 });
        return;
      }

      switch (action.kind) {
        case 'add_list_item': {
          const list = lists.find((l) => l.id === action.list_id);
          if (!list) {
            show({ message: `Couldn't find that list`, duration: 4000 });
            return;
          }
          const position = listItems.filter((i) => i.list_id === list.id).length;
          const id = addListItem({
            list_id: list.id,
            title: action.title,
            notes: null,
            done: false,
            done_at: null,
            repeat: 'never',
            next_due: null,
            due_date: action.due_date ?? null,
            assigned_to: action.assigned_to ?? null,
            position,
          });
          show({
            message: `Added "${action.title}" to ${list.name}`,
            onUndo: () => deleteListItem(id),
          });
          return;
        }

        case 'add_event': {
          const id = addEvent({
            title: action.title,
            description: action.description ?? null,
            start_at: action.start_at,
            end_at: action.end_at,
            all_day: action.all_day,
            location: action.location ?? null,
            category: action.category,
            member_ids: action.member_ids,
            recurrence: null,
            reminder_offsets: [],
            created_by: activeMember?.id ?? null,
          });
          const whose =
            action.member_ids.length === 1
              ? (memberById(action.member_ids[0])?.name ?? '')
              : '';
          const when = action.all_day
            ? new Date(action.start_at).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
            : new Date(action.start_at).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              });
          show({
            message: `Added ${whose ? whose + ': ' : ''}${action.title} — ${when}`,
            onUndo: () => deleteEvent(id),
          });
          return;
        }

        case 'log_habit': {
          const habit = habits.find((h) => h.id === action.habit_id);
          if (!habit) {
            show({ message: `Couldn't find that habit`, duration: 4000 });
            return;
          }
          const forDate = action.for_date || localISO(new Date());
          incrementCheckIn(habit.id, habit.member_id, forDate);
          show({
            message: `Logged "${habit.title}"`,
            onUndo: () => decrementCheckIn(habit.id, habit.member_id, forDate),
          });
          return;
        }

        case 'set_status': {
          const target = memberById(action.member_id);
          if (!target) {
            show({ message: `Couldn't find that member`, duration: 4000 });
            return;
          }
          const prevLocation = target.current_location;
          const prevUntil = target.location_until;
          setMemberLocation(target.id, action.location, action.until ?? null);
          show({
            message: `${target.name}: ${action.location}${action.until ? ' til ' + action.until.slice(0, 10) : ''}`,
            onUndo: () => setMemberLocation(target.id, prevLocation, prevUntil),
          });
          return;
        }

        case 'add_chore': {
          if (activeMember?.role !== 'parent') {
            show({ message: 'Only parents can add chores', duration: 4000 });
            return;
          }
          const id = addChore({
            title: action.title,
            description: null,
            assigned_to: action.assigned_to,
            frequency: action.frequency,
            weekdays: action.weekdays,
            payout: {},
            active_from: localISO(new Date()),
            requires_photo: false,
            requires_approval: false,
            archived: false,
            mode: 'standard',
            rotation_roster: [],
            rotation_pointer: 0,
            rotation_anchor_iso_week: null,
            roster_role_name: null,
          });
          show({
            message: `Added chore "${action.title}"`,
            onUndo: () => deleteChore(id),
          });
          return;
        }

        case 'unknown':
        default: {
          const reason =
            (action as { reason?: string }).reason ?? "Sorry, I didn't catch that";
          show({ message: reason, duration: 5000 });
          return;
        }
      }
    },
    [
      family.id,
      activeMember,
      members,
      lists,
      listItems,
      habits,
      chores,
      addEvent,
      deleteEvent,
      addListItem,
      deleteListItem,
      addChore,
      deleteChore,
      incrementCheckIn,
      decrementCheckIn,
      setMemberLocation,
      show,
      memberById,
    ],
  );

  return { dispatch };
}
