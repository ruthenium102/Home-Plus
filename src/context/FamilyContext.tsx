import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  ReactNode
} from 'react';
import { localISO } from '@/lib/dates';
import {
  storage,
  DEMO_FAMILY,
  DEMO_MEMBERS,
  DEMO_EVENTS,
  DEMO_CHORES,
  DEMO_COMPLETIONS,
  DEMO_REDEMPTIONS,
  DEMO_GOALS,
  DEMO_LISTS,
  DEMO_LIST_ITEMS,
  DEMO_HABITS,
  DEMO_HABIT_CHECKINS,
  DEMO_ACTIVITY_POOL,
  DEFAULT_REWARD_CATEGORIES,
  hashPinSync,
  verifyPinSync
} from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  ActiveSession,
  ActivityPoolItem,
  CalendarEvent,
  Chore,
  ChoreCompletion,
  DayPlanBlock,
  DayPlanSection,
  Family,
  FamilyMember,
  Habit,
  HabitCheckIn,
  Redemption,
  RewardCategory,
  RewardCategoryKey,
  RewardGoal,
  TodoItem,
  TodoList
} from '@/types';

interface FamilyContextValue {
  family: Family;
  members: FamilyMember[];
  events: CalendarEvent[];
  chores: Chore[];
  completions: ChoreCompletion[];
  redemptions: Redemption[];
  goals: RewardGoal[];
  rewardCategories: RewardCategory[];
  lists: TodoList[];
  listItems: TodoItem[];
  habits: Habit[];
  checkIns: HabitCheckIn[];
  activeMember: FamilyMember | null;
  isDemoMode: boolean;

  // Auth
  signInAs: (memberId: string, pin: string | null) => { ok: boolean; error?: string };
  signOut: () => void;

  // Events
  addEvent: (e: Omit<CalendarEvent, 'id' | 'created_at' | 'family_id'>) => void;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;

  // Members
  updateMember: (id: string, patch: Partial<FamilyMember>) => void;
  setMemberPin: (id: string, pin: string | null) => void;
  setMemberLocation: (id: string, location: string | null, until: string | null) => void;

  // Chores
  addChore: (c: Omit<Chore, 'id' | 'created_at' | 'family_id'>) => void;
  updateChore: (id: string, patch: Partial<Chore>) => void;
  deleteChore: (id: string) => void;
  completeChore: (choreId: string, memberId: string, forDate: string) => ChoreCompletion;
  approveCompletion: (completionId: string, approverId: string) => void;
  rejectCompletion: (completionId: string, approverId: string) => void;

  // Redemptions
  requestRedemption: (
    memberId: string,
    category: RewardCategoryKey,
    amount: number,
    reason: string
  ) => Redemption;
  approveRedemption: (id: string, approverId: string) => void;
  rejectRedemption: (id: string, approverId: string) => void;

  // Goals
  addGoal: (g: Omit<RewardGoal, 'id' | 'created_at' | 'family_id' | 'achieved_at'>) => void;
  deleteGoal: (id: string) => void;

  // Lists
  addList: (l: Omit<TodoList, 'id' | 'created_at' | 'family_id'>) => string;
  updateList: (id: string, patch: Partial<TodoList>) => void;
  deleteList: (id: string) => void;
  addListItem: (item: Omit<TodoItem, 'id' | 'created_at' | 'family_id'>) => void;
  updateListItem: (id: string, patch: Partial<TodoItem>) => void;
  toggleListItem: (id: string) => void;
  deleteListItem: (id: string) => void;

  // Habits
  addHabit: (h: Omit<Habit, 'id' | 'created_at' | 'family_id'>) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleCheckIn: (habitId: string, memberId: string, forDate: string) => void;

  // My Day
  dayPlanBlocks: DayPlanBlock[];
  activityPool: ActivityPoolItem[];
  addDayPlanBlock: (block: Omit<DayPlanBlock, 'id' | 'created_at' | 'family_id'>) => DayPlanBlock;
  updateDayPlanBlock: (id: string, patch: Partial<DayPlanBlock>) => void;
  removeDayPlanBlock: (id: string) => void;
  reorderDayPlanBlocks: (updates: { id: string; position: number; section: DayPlanSection }[]) => void;
  toggleBlockDone: (id: string) => void;
  addPoolItem: (item: Omit<ActivityPoolItem, 'id' | 'created_at' | 'family_id'>) => void;
  updatePoolItem: (id: string, patch: Partial<ActivityPoolItem>) => void;
  archivePoolItem: (id: string) => void;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

const SESSION_KEY = 'session';
const FAMILY_KEY = 'demo:family';
const EVENTS_KEY = 'demo:events';
const MEMBERS_KEY = 'demo:members';
const CHORES_KEY = 'demo:chores';
const COMPLETIONS_KEY = 'demo:completions';
const REDEMPTIONS_KEY = 'demo:redemptions';
const GOALS_KEY = 'demo:goals';
const LISTS_KEY = 'demo:lists';
const LIST_ITEMS_KEY = 'demo:list_items';
const HABITS_KEY = 'demo:habits';
const CHECKINS_KEY = 'demo:checkins';
const DAY_PLAN_KEY = 'demo:day_plan_blocks';
const ACTIVITY_POOL_KEY = 'demo:activity_pool';

// When Supabase auth is configured we start with a blank slate — no demo seed.
const LIVE = isSupabaseConfigured;

function uid(prefix: string) {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Compute streak length for a habit by looking at consecutive check-ins
 * working backwards from today.
 */
function computeStreak(checkIns: HabitCheckIn[], habitId: string, memberId: string): number {
  const dates = new Set(
    checkIns
      .filter((c) => c.habit_id === habitId && c.member_id === memberId)
      .map((c) => c.for_date)
  );
  let streak = 0;
  const cursor = new Date();
  // Allow today not yet checked in — start from today; if missing, try yesterday.
  for (let i = 0; i < 365; i++) {
    const iso = localISO(cursor);
    if (dates.has(iso)) {
      streak++;
    } else if (i === 0) {
      // No check-in today is fine, keep looking from yesterday
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const STREAK_MILESTONES: Record<number, number> = {
  7: 10,
  30: 50,
  100: 200
};

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [family, setFamily] = useState<Family>(() =>
    storage.get<Family>(FAMILY_KEY, LIVE ? DEMO_FAMILY : DEMO_FAMILY)
  );
  const [members, setMembers] = useState<FamilyMember[]>(() =>
    storage.get<FamilyMember[]>(MEMBERS_KEY, LIVE ? [] : DEMO_MEMBERS)
  );
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    storage.get<CalendarEvent[]>(EVENTS_KEY, LIVE ? [] : DEMO_EVENTS)
  );
  const [chores, setChores] = useState<Chore[]>(() =>
    storage.get<Chore[]>(CHORES_KEY, LIVE ? [] : DEMO_CHORES)
  );
  const [completions, setCompletions] = useState<ChoreCompletion[]>(() =>
    storage.get<ChoreCompletion[]>(COMPLETIONS_KEY, LIVE ? [] : DEMO_COMPLETIONS)
  );
  const [redemptions, setRedemptions] = useState<Redemption[]>(() =>
    storage.get<Redemption[]>(REDEMPTIONS_KEY, LIVE ? [] : DEMO_REDEMPTIONS)
  );
  const [goals, setGoals] = useState<RewardGoal[]>(() =>
    storage.get<RewardGoal[]>(GOALS_KEY, LIVE ? [] : DEMO_GOALS)
  );
  const [lists, setLists] = useState<TodoList[]>(() =>
    storage.get<TodoList[]>(LISTS_KEY, LIVE ? [] : DEMO_LISTS)
  );
  const [listItems, setListItems] = useState<TodoItem[]>(() =>
    storage.get<TodoItem[]>(LIST_ITEMS_KEY, LIVE ? [] : DEMO_LIST_ITEMS)
  );
  const [habits, setHabits] = useState<Habit[]>(() =>
    storage.get<Habit[]>(HABITS_KEY, LIVE ? [] : DEMO_HABITS)
  );
  const [checkIns, setCheckIns] = useState<HabitCheckIn[]>(() =>
    storage.get<HabitCheckIn[]>(CHECKINS_KEY, LIVE ? [] : DEMO_HABIT_CHECKINS)
  );
  const [session, setSession] = useState<ActiveSession | null>(() =>
    storage.get<ActiveSession | null>(SESSION_KEY, null)
  );
  const [dayPlanBlocks, setDayPlanBlocks] = useState<DayPlanBlock[]>(() =>
    storage.get<DayPlanBlock[]>(DAY_PLAN_KEY, [])
  );
  const [activityPool, setActivityPool] = useState<ActivityPoolItem[]>(() =>
    storage.get<ActivityPoolItem[]>(ACTIVITY_POOL_KEY, LIVE ? [] : DEMO_ACTIVITY_POOL)
  );

  // When Supabase is configured and the members list is empty (fresh account),
  // seed the initial parent member + family name from the auth user's signup metadata.
  const seeded = useRef(false);
  useEffect(() => {
    if (!LIVE || !supabase) return;

    const trySeed = async (userId: string | null, userMeta: Record<string, unknown> | null, userEmail: string | null) => {
      if (!userId || seeded.current) return;
      const existing = storage.get<FamilyMember[]>(MEMBERS_KEY, []);
      if (existing.length > 0) { seeded.current = true; return; }

      seeded.current = true;
      const name = (userMeta?.name as string) || userEmail?.split('@')[0] || 'You';
      const familyName = (userMeta?.family_name as string) || 'My Family';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const familyId = 'f-' + userId.slice(0, 8);
      const memberId = 'm-' + userId.slice(0, 8);
      const now = new Date().toISOString();

      const newFamily: Family = { id: familyId, name: familyName, timezone: tz, created_at: now };
      const newMember: FamilyMember = {
        id: memberId, family_id: familyId, name,
        role: 'parent', color: 'terracotta',
        avatar_url: null, pin_hash: null, birthday: null,
        current_location: null, location_until: null,
        reward_balances: {}, my_day_enabled: false,
        created_at: now
      };

      setFamily(newFamily);
      setMembers([newMember]);
      const sess: ActiveSession = { member_id: memberId, authenticated_at: Date.now() };
      storage.set(SESSION_KEY, sess);
      setSession(sess);
    };

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      trySeed(u?.id ?? null, u?.user_metadata ?? null, u?.email ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      const u = sess?.user;
      trySeed(u?.id ?? null, u?.user_metadata ?? null, u?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Persist
  useEffect(() => storage.set(FAMILY_KEY, family), [family]);
  useEffect(() => storage.set(MEMBERS_KEY, members), [members]);
  useEffect(() => storage.set(EVENTS_KEY, events), [events]);
  useEffect(() => storage.set(CHORES_KEY, chores), [chores]);
  useEffect(() => storage.set(COMPLETIONS_KEY, completions), [completions]);
  useEffect(() => storage.set(REDEMPTIONS_KEY, redemptions), [redemptions]);
  useEffect(() => storage.set(GOALS_KEY, goals), [goals]);
  useEffect(() => storage.set(LISTS_KEY, lists), [lists]);
  useEffect(() => storage.set(LIST_ITEMS_KEY, listItems), [listItems]);
  useEffect(() => storage.set(HABITS_KEY, habits), [habits]);
  useEffect(() => storage.set(CHECKINS_KEY, checkIns), [checkIns]);
  useEffect(() => storage.set(DAY_PLAN_KEY, dayPlanBlocks), [dayPlanBlocks]);
  useEffect(() => storage.set(ACTIVITY_POOL_KEY, activityPool), [activityPool]);
  useEffect(() => {
    if (session) storage.set(SESSION_KEY, session);
    else storage.remove(SESSION_KEY);
  }, [session]);

  const activeMember = useMemo(
    () => (session ? members.find((m) => m.id === session.member_id) ?? null : null),
    [session, members]
  );

  // Auto-revert "Away til..." when the until date passes
  useEffect(() => {
    const now = new Date();
    members.forEach((m) => {
      if (m.location_until && new Date(m.location_until) < now) {
        setMembers((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? { ...x, current_location: 'Home', location_until: null }
              : x
          )
        );
      }
    });
    // Run only on mount and when members count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Auth ----------------------------------------------------------------

  const signInAs = useCallback(
    (memberId: string, pin: string | null): { ok: boolean; error?: string } => {
      const m = members.find((x) => x.id === memberId);
      if (!m) return { ok: false, error: 'Member not found' };
      if (m.pin_hash) {
        if (!pin) return { ok: false, error: 'PIN required' };
        if (!verifyPinSync(pin, m.pin_hash)) return { ok: false, error: 'Wrong PIN' };
      }
      setSession({ member_id: memberId, authenticated_at: Date.now() });
      return { ok: true };
    },
    [members]
  );

  const signOut = useCallback(() => setSession(null), []);

  // ---- Events --------------------------------------------------------------

  const addEvent = useCallback(
    (e: Omit<CalendarEvent, 'id' | 'created_at' | 'family_id'>) =>
      setEvents((prev) => [
        ...prev,
        {
          ...e,
          id: uid('e'),
          created_at: new Date().toISOString(),
          family_id: family.id
        }
      ]),
    [family.id]
  );

  const updateEvent = useCallback(
    (id: string, patch: Partial<CalendarEvent>) =>
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e))),
    []
  );

  const deleteEvent = useCallback(
    (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id)),
    []
  );

  // ---- Members -------------------------------------------------------------

  const updateMember = useCallback(
    (id: string, patch: Partial<FamilyMember>) =>
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m))),
    []
  );

  const setMemberPin = useCallback((id: string, pin: string | null) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, pin_hash: pin ? hashPinSync(pin) : null } : m
      )
    );
  }, []);

  const setMemberLocation = useCallback(
    (id: string, location: string | null, until: string | null) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, current_location: location, location_until: until }
            : m
        )
      );
    },
    []
  );

  // ---- Chores --------------------------------------------------------------

  const addChore = useCallback(
    (c: Omit<Chore, 'id' | 'created_at' | 'family_id'>) =>
      setChores((prev) => [
        ...prev,
        {
          ...c,
          id: uid('c'),
          created_at: new Date().toISOString(),
          family_id: family.id
        }
      ]),
    [family.id]
  );

  const updateChore = useCallback(
    (id: string, patch: Partial<Chore>) =>
      setChores((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    []
  );

  const deleteChore = useCallback(
    (id: string) => setChores((prev) => prev.filter((c) => c.id !== id)),
    []
  );

  function applyPayout(
    membersList: FamilyMember[],
    memberId: string,
    payout: ChoreCompletion['payout'],
    direction: 1 | -1 = 1
  ): FamilyMember[] {
    return membersList.map((m) => {
      if (m.id !== memberId) return m;
      const next = { ...m.reward_balances };
      for (const [k, v] of Object.entries(payout)) {
        if (typeof v !== 'number') continue;
        next[k] = (next[k] || 0) + v * direction;
        if (next[k] < 0) next[k] = 0;
      }
      return { ...m, reward_balances: next };
    });
  }

  const completeChore = useCallback(
    (choreId: string, memberId: string, forDate: string): ChoreCompletion => {
      const chore = chores.find((c) => c.id === choreId);
      if (!chore) throw new Error('Chore not found: ' + choreId);

      const status: ChoreCompletion['status'] = chore.requires_approval
        ? 'pending_approval'
        : 'approved';

      const completion: ChoreCompletion = {
        id: uid('cc'),
        chore_id: choreId,
        family_id: family.id,
        member_id: memberId,
        for_date: forDate,
        status,
        photo_url: null,
        payout: { ...chore.payout },
        approved_by: null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        note: null,
        created_at: new Date().toISOString()
      };

      setCompletions((prev) => [...prev, completion]);

      if (status === 'approved') {
        setMembers((prev) => applyPayout(prev, memberId, chore.payout, 1));
      }

      return completion;
    },
    [chores, family.id]
  );

  const approveCompletion = useCallback((completionId: string, approverId: string) => {
    setCompletions((prev) => {
      const target = prev.find((c) => c.id === completionId);
      if (!target || target.status !== 'pending_approval') return prev;
      setMembers((m) => applyPayout(m, target.member_id, target.payout, 1));
      return prev.map((c) =>
        c.id === completionId
          ? {
              ...c,
              status: 'approved',
              approved_by: approverId,
              approved_at: new Date().toISOString()
            }
          : c
      );
    });
  }, []);

  const rejectCompletion = useCallback((completionId: string, approverId: string) =>
    setCompletions((prev) =>
      prev.map((c) =>
        c.id === completionId
          ? {
              ...c,
              status: 'rejected',
              approved_by: approverId,
              approved_at: new Date().toISOString()
            }
          : c
      )
    ), []);

  // ---- Redemptions ---------------------------------------------------------

  const requestRedemption = useCallback(
    (
      memberId: string,
      category: RewardCategoryKey,
      amount: number,
      reason: string
    ): Redemption => {
      const cat = DEFAULT_REWARD_CATEGORIES.find((c) => c.key === category);
      const threshold = cat?.auto_approve_under ?? null;
      const autoApprove = threshold !== null && threshold > 0 && amount <= threshold;

      const redemption: Redemption = {
        id: uid('r'),
        family_id: family.id,
        member_id: memberId,
        category,
        amount,
        reason,
        status: autoApprove ? 'approved' : 'pending_approval',
        approved_by: null,
        approved_at: autoApprove ? new Date().toISOString() : null,
        created_at: new Date().toISOString()
      };

      setRedemptions((prev) => [...prev, redemption]);

      if (autoApprove) {
        setMembers((prev) =>
          applyPayout(prev, memberId, { [category]: amount } as any, -1)
        );
      }

      return redemption;
    },
    [family.id]
  );

  const approveRedemption = useCallback((id: string, approverId: string) => {
    setRedemptions((prev) => {
      const r = prev.find((x) => x.id === id);
      if (!r || r.status !== 'pending_approval') return prev;
      setMembers((m) =>
        applyPayout(m, r.member_id, { [r.category]: r.amount } as any, -1)
      );
      return prev.map((x) =>
        x.id === id
          ? {
              ...x,
              status: 'approved',
              approved_by: approverId,
              approved_at: new Date().toISOString()
            }
          : x
      );
    });
  }, []);

  const rejectRedemption = useCallback((id: string, approverId: string) =>
    setRedemptions((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              status: 'rejected',
              approved_by: approverId,
              approved_at: new Date().toISOString()
            }
          : x
      )
    ), []);

  // ---- Goals ---------------------------------------------------------------

  const addGoal = useCallback(
    (g: Omit<RewardGoal, 'id' | 'created_at' | 'family_id' | 'achieved_at'>) =>
      setGoals((prev) => [
        ...prev,
        {
          ...g,
          id: uid('g'),
          created_at: new Date().toISOString(),
          family_id: family.id,
          achieved_at: null
        }
      ]),
    [family.id]
  );

  const deleteGoal = useCallback(
    (id: string) => setGoals((prev) => prev.filter((g) => g.id !== id)),
    []
  );

  // ---- Lists ---------------------------------------------------------------

  const addList = useCallback(
    (l: Omit<TodoList, 'id' | 'created_at' | 'family_id'>): string => {
      const id = uid('l');
      setLists((prev) => [
        ...prev,
        { ...l, id, created_at: new Date().toISOString(), family_id: family.id }
      ]);
      return id;
    },
    [family.id]
  );

  const updateList = useCallback(
    (id: string, patch: Partial<TodoList>) =>
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))),
    []
  );

  const deleteList = useCallback((id: string) => {
    setLists((prev) => prev.filter((l) => l.id !== id));
    setListItems((prev) => prev.filter((i) => i.list_id !== id));
  }, []);

  const addListItem = useCallback(
    (item: Omit<TodoItem, 'id' | 'created_at' | 'family_id'>) =>
      setListItems((prev) => [
        ...prev,
        {
          ...item,
          id: uid('li'),
          created_at: new Date().toISOString(),
          family_id: family.id
        }
      ]),
    [family.id]
  );

  const updateListItem = useCallback(
    (id: string, patch: Partial<TodoItem>) =>
      setListItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    []
  );

  const toggleListItem = useCallback((id: string) => {
    setListItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const nowDone = !i.done;
        let next_due = i.next_due;
        // Repeating task — when completed, schedule the next due date and reopen
        if (nowDone && i.repeat !== 'never') {
          const d = new Date();
          switch (i.repeat) {
            case 'daily':
              d.setDate(d.getDate() + 1);
              break;
            case 'weekly':
              d.setDate(d.getDate() + 7);
              break;
            case 'monthly':
              d.setMonth(d.getMonth() + 1);
              break;
            case 'quarterly':
              d.setMonth(d.getMonth() + 3);
              break;
            case 'biannually':
              d.setMonth(d.getMonth() + 6);
              break;
            case 'yearly':
              d.setFullYear(d.getFullYear() + 1);
              break;
          }
          next_due = localISO(d);
          // Reopen after a tick — but for UX simplicity, also mark done with a
          // fresh next_due so the user sees the strike-through briefly.
          // (We'll let the UI surface "Next: 2026-11-08" as a hint.)
        }
        return {
          ...i,
          done: nowDone,
          done_at: nowDone ? new Date().toISOString() : null,
          next_due
        };
      })
    );
  }, []);

  const deleteListItem = useCallback(
    (id: string) => setListItems((prev) => prev.filter((i) => i.id !== id)),
    []
  );

  // ---- Habits --------------------------------------------------------------

  const addHabit = useCallback(
    (h: Omit<Habit, 'id' | 'created_at' | 'family_id'>) =>
      setHabits((prev) => [
        ...prev,
        { ...h, id: uid('h'), created_at: new Date().toISOString(), family_id: family.id }
      ]),
    [family.id]
  );

  const updateHabit = useCallback(
    (id: string, patch: Partial<Habit>) =>
      setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h))),
    []
  );

  const deleteHabit = useCallback((id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    setCheckIns((prev) => prev.filter((c) => c.habit_id !== id));
  }, []);

  const toggleCheckIn = useCallback(
    (habitId: string, memberId: string, forDate: string) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      const existing = checkIns.find(
        (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === forDate
      );

      if (existing) {
        // Remove check-in (no reward refund — keep it simple)
        setCheckIns((prev) => prev.filter((c) => c.id !== existing.id));
        return;
      }

      const newCheckIn: HabitCheckIn = {
        id: uid('hc'),
        habit_id: habitId,
        family_id: family.id,
        member_id: memberId,
        for_date: forDate,
        created_at: new Date().toISOString()
      };

      const nextCheckIns = [...checkIns, newCheckIn];
      setCheckIns(nextCheckIns);

      // Streak rewards — for kids on habits with streak_rewards enabled.
      // Awarded whenever a check-in causes the streak to land on a milestone,
      // including on backfilled days (per "kid-friendly but gameable" mode).
      const member = members.find((m) => m.id === memberId);
      if (member?.role === 'child' && habit.streak_rewards) {
        const streak = computeStreak(nextCheckIns, habitId, memberId);
        const reward = STREAK_MILESTONES[streak];
        if (reward) {
          setMembers((prev) =>
            prev.map((m) =>
              m.id === memberId
                ? {
                    ...m,
                    reward_balances: {
                      ...m.reward_balances,
                      stars: (m.reward_balances.stars || 0) + reward
                    }
                  }
                : m
            )
          );
        }
      }
    },
    [habits, checkIns, members, family.id]
  );

  // ---- My Day ----------------------------------------------------------------

  const addDayPlanBlock = useCallback(
    (block: Omit<DayPlanBlock, 'id' | 'created_at' | 'family_id'>): DayPlanBlock => {
      const newBlock: DayPlanBlock = {
        ...block,
        id: uid('dp'),
        created_at: new Date().toISOString(),
        family_id: family.id
      };
      setDayPlanBlocks((prev) => [...prev, newBlock]);
      if (block.source === 'other') {
        setActivityPool((prev) =>
          prev.map((p) => (p.id === block.source_id ? { ...p, usage_count: p.usage_count + 1 } : p))
        );
      }
      return newBlock;
    },
    [family.id]
  );

  const updateDayPlanBlock = useCallback(
    (id: string, patch: Partial<DayPlanBlock>) =>
      setDayPlanBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b))),
    []
  );

  const removeDayPlanBlock = useCallback(
    (id: string) => setDayPlanBlocks((prev) => prev.filter((b) => b.id !== id)),
    []
  );

  const reorderDayPlanBlocks = useCallback(
    (updates: { id: string; position: number; section: DayPlanSection }[]) =>
      setDayPlanBlocks((prev) =>
        prev.map((b) => {
          const u = updates.find((x) => x.id === b.id);
          return u ? { ...b, position: u.position, section: u.section } : b;
        })
      ),
    []
  );

  const toggleBlockDone = useCallback(
    (id: string) =>
      setDayPlanBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, done: !b.done, done_at: !b.done ? new Date().toISOString() : null }
            : b
        )
      ),
    []
  );

  const addPoolItem = useCallback(
    (item: Omit<ActivityPoolItem, 'id' | 'created_at' | 'family_id'>) =>
      setActivityPool((prev) => [
        ...prev,
        { ...item, id: uid('ap'), created_at: new Date().toISOString(), family_id: family.id }
      ]),
    [family.id]
  );

  const updatePoolItem = useCallback(
    (id: string, patch: Partial<ActivityPoolItem>) =>
      setActivityPool((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    []
  );

  const archivePoolItem = useCallback(
    (id: string) =>
      setActivityPool((prev) => prev.map((p) => (p.id === id ? { ...p, archived: true } : p))),
    []
  );

  const value: FamilyContextValue = {
    family,
    members,
    events,
    chores,
    completions,
    redemptions,
    goals,
    rewardCategories: DEFAULT_REWARD_CATEGORIES,
    lists,
    listItems,
    habits,
    checkIns,
    activeMember,
    isDemoMode: !isSupabaseConfigured,
    signInAs,
    signOut,
    addEvent,
    updateEvent,
    deleteEvent,
    updateMember,
    setMemberPin,
    setMemberLocation,
    addChore,
    updateChore,
    deleteChore,
    completeChore,
    approveCompletion,
    rejectCompletion,
    requestRedemption,
    approveRedemption,
    rejectRedemption,
    addGoal,
    deleteGoal,
    addList,
    updateList,
    deleteList,
    addListItem,
    updateListItem,
    toggleListItem,
    deleteListItem,
    addHabit,
    updateHabit,
    deleteHabit,
    toggleCheckIn,
    dayPlanBlocks,
    activityPool,
    addDayPlanBlock,
    updateDayPlanBlock,
    removeDayPlanBlock,
    reorderDayPlanBlocks,
    toggleBlockDone,
    addPoolItem,
    updatePoolItem,
    archivePoolItem
  };

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider');
  return ctx;
}
