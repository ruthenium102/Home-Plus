import { localISO, localISODaysAgo } from '@/lib/dates';
import { isoWeekStr } from '@/lib/rotation';
import type {
  ActivityPoolItem,
  CalendarEvent,
  Chore,
  ChoreCompletion,
  Family,
  FamilyMember,
  Habit,
  HabitCheckIn,
  Redemption,
  RewardCategory,
  RewardGoal,
  TodoItem,
  TodoList
} from '@/types';

/**
 * Local storage helpers + demo seed data.
 * Keys prefixed `hp:` (Home Plus) to avoid collisions.
 *
 * NOTE: Bumping SEED_VERSION clears stale demo data on next load. Use this
 * when the seed schema or default family changes (e.g. Henderson → Ellis).
 */
const PREFIX = 'hp:';
const SEED_VERSION = 11; // 1=Henderson, 2=Ellis+chores, 3=Phase3, 4=swipe+backfill+import, 5=my-day, 6=rotation, 7=clean-reset, 8=live-mode-empty-defaults, 9=db-wipe, 10=page-flags+email, 11=virtual-pet

// On first load, if the user has stale demo data from a previous version,
// wipe the demo:* keys so they get the fresh seed.
try {
  const stored = parseInt(localStorage.getItem(PREFIX + 'seed_version') || '0', 10);
  if (stored !== SEED_VERSION) {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) || k.startsWith('sb-'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(PREFIX + 'seed_version', String(SEED_VERSION));
  }
} catch {
  // localStorage unavailable (SSR, private mode) — no-op
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // quota exceeded etc — fail quietly
    }
  },
  remove(key: string) {
    localStorage.removeItem(PREFIX + key);
  }
};

// ---- Seed helpers ----------------------------------------------------------

const TODAY = new Date();
function isoAt(daysOffset: number, hour: number, minute = 0): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function daysAgoISO(n: number) {
  return localISODaysAgo(n);
}

// ---- Family ----------------------------------------------------------------

export const DEMO_FAMILY: Family = {
  id: 'fam-ellis',
  name: 'The Ellis Family',
  timezone: 'Australia/Perth',
  created_at: new Date().toISOString()
};

export const DEMO_MEMBERS: FamilyMember[] = [
  {
    id: 'm-ben',
    family_id: 'fam-ellis',
    name: 'Ben',
    role: 'parent',
    color: 'terracotta',
    avatar_url: null,
    pin_hash: hashPinSync('1234'),
    birthday: null,
    current_location: 'Home',
    location_until: null,
    reward_balances: {},
    my_day_enabled: false, chores_enabled: true, habits_enabled: true, kitchen_enabled: false, pet_enabled: false, email: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'm-susan',
    family_id: 'fam-ellis',
    name: 'Susan',
    role: 'parent',
    color: 'sage',
    avatar_url: null,
    pin_hash: hashPinSync('1234'),
    birthday: null,
    current_location: 'Home',
    location_until: null,
    reward_balances: {},
    my_day_enabled: false, chores_enabled: true, habits_enabled: true, kitchen_enabled: false, pet_enabled: false, email: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'm-sophie',
    family_id: 'fam-ellis',
    name: 'Sophie',
    role: 'child',
    color: 'rose',
    avatar_url: null,
    pin_hash: null,
    birthday: '2009-10-04',
    current_location: 'School',
    location_until: null,
    reward_balances: { stars: 184, screen_minutes: 60, savings_cents: 4200 },
    my_day_enabled: false, chores_enabled: true, habits_enabled: true, kitchen_enabled: false, pet_enabled: false, email: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'm-henry',
    family_id: 'fam-ellis',
    name: 'Henry',
    role: 'child',
    color: 'dusty-blue',
    avatar_url: null,
    pin_hash: null,
    birthday: '2011-05-24',
    current_location: 'School',
    location_until: null,
    reward_balances: { stars: 132, screen_minutes: 30, savings_cents: 1850 },
    my_day_enabled: true, chores_enabled: true, habits_enabled: true, kitchen_enabled: false, pet_enabled: false, email: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'm-laura',
    family_id: 'fam-ellis',
    name: 'Laura',
    role: 'child',
    color: 'sand',
    avatar_url: null,
    pin_hash: null,
    birthday: '2014-09-11',
    current_location: 'School',
    location_until: null,
    reward_balances: { stars: 96, screen_minutes: 45, savings_cents: 750 },
    my_day_enabled: false, chores_enabled: true, habits_enabled: true, kitchen_enabled: false, pet_enabled: false, email: null,
    created_at: new Date().toISOString()
  }
];

// ---- Reward categories -----------------------------------------------------

export const DEFAULT_REWARD_CATEGORIES: RewardCategory[] = [
  { key: 'stars', label: 'Stars', unit: '★', auto_approve_under: 30 },
  { key: 'screen_minutes', label: 'Screen time', unit: 'min', auto_approve_under: 30 },
  { key: 'savings_cents', label: 'Savings', unit: '$', auto_approve_under: 0 }
];

// ---- Events ----------------------------------------------------------------

export const DEMO_EVENTS: CalendarEvent[] = [
  {
    id: 'e1',
    family_id: 'fam-ellis',
    title: 'Dentist appointment',
    description: null,
    start_at: isoAt(0, 9, 0),
    end_at: isoAt(0, 9, 45),
    all_day: false,
    location: 'Subiaco Dental',
    category: 'medical',
    member_ids: ['m-susan'],
    recurrence: null,
    reminder_offsets: [60],
    created_by: 'm-susan',
    created_at: new Date().toISOString()
  },
  {
    id: 'e2',
    family_id: 'fam-ellis',
    title: 'School pickup',
    description: null,
    start_at: isoAt(0, 15, 15),
    end_at: isoAt(0, 15, 45),
    all_day: false,
    location: null,
    category: 'school',
    member_ids: ['m-laura'],
    recurrence: { freq: 'weekly', interval: 1, byweekday: [1, 2, 3, 4, 5] },
    reminder_offsets: [15],
    created_by: 'm-susan',
    created_at: new Date().toISOString()
  },
  {
    id: 'e3',
    family_id: 'fam-ellis',
    title: 'Soccer training',
    description: 'Bring boots + water',
    start_at: isoAt(0, 16, 0),
    end_at: isoAt(0, 17, 30),
    all_day: false,
    location: 'Shenton Park',
    category: 'sport',
    member_ids: ['m-henry'],
    recurrence: { freq: 'weekly', interval: 1, byweekday: [4] },
    reminder_offsets: [30],
    created_by: 'm-susan',
    created_at: new Date().toISOString()
  },
  {
    id: 'e4',
    family_id: 'fam-ellis',
    title: 'Dinner: chicken katsu',
    description: 'From Kitchen Plus meal plan',
    start_at: isoAt(0, 19, 0),
    end_at: isoAt(0, 19, 45),
    all_day: false,
    location: null,
    category: 'meal',
    member_ids: [],
    recurrence: null,
    reminder_offsets: [],
    created_by: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'e5',
    family_id: 'fam-ellis',
    title: 'Sophie - Netball',
    description: null,
    start_at: isoAt(1, 17, 0),
    end_at: isoAt(1, 18, 30),
    all_day: false,
    location: 'Matthews Centre',
    category: 'sport',
    member_ids: ['m-sophie'],
    recurrence: { freq: 'weekly', interval: 1, byweekday: [5] },
    reminder_offsets: [30],
    created_by: 'm-susan',
    created_at: new Date().toISOString()
  },
  {
    id: 'e6',
    family_id: 'fam-ellis',
    title: 'Swimming lessons',
    description: null,
    start_at: isoAt(2, 16, 30),
    end_at: isoAt(2, 17, 15),
    all_day: false,
    location: 'Aqualife Centre',
    category: 'sport',
    member_ids: ['m-henry', 'm-laura'],
    recurrence: { freq: 'weekly', interval: 1, byweekday: [6] },
    reminder_offsets: [30],
    created_by: 'm-susan',
    created_at: new Date().toISOString()
  },
  {
    id: 'e7',
    family_id: 'fam-ellis',
    title: 'Book club',
    description: null,
    start_at: isoAt(3, 19, 30),
    end_at: isoAt(3, 21, 30),
    all_day: false,
    location: null,
    category: 'social',
    member_ids: ['m-susan'],
    recurrence: { freq: 'monthly', interval: 1 },
    reminder_offsets: [60],
    created_by: 'm-susan',
    created_at: new Date().toISOString()
  },
  {
    id: 'e8',
    family_id: 'fam-ellis',
    title: "Sophie's birthday",
    description: null,
    start_at: '2009-10-04T00:00:00.000Z',
    end_at: '2009-10-04T23:59:00.000Z',
    all_day: true,
    location: null,
    category: 'social',
    member_ids: ['m-sophie'],
    recurrence: { freq: 'yearly', interval: 1 },
    reminder_offsets: [1440],
    created_by: 'm-ben',
    created_at: new Date().toISOString()
  },
  {
    id: 'e9',
    family_id: 'fam-ellis',
    title: "Henry's birthday",
    description: null,
    start_at: '2011-05-24T00:00:00.000Z',
    end_at: '2011-05-24T23:59:00.000Z',
    all_day: true,
    location: null,
    category: 'social',
    member_ids: ['m-henry'],
    recurrence: { freq: 'yearly', interval: 1 },
    reminder_offsets: [1440],
    created_by: 'm-ben',
    created_at: new Date().toISOString()
  },
  {
    id: 'e10',
    family_id: 'fam-ellis',
    title: "Laura's birthday",
    description: null,
    start_at: '2014-09-11T00:00:00.000Z',
    end_at: '2014-09-11T23:59:00.000Z',
    all_day: true,
    location: null,
    category: 'social',
    member_ids: ['m-laura'],
    recurrence: { freq: 'yearly', interval: 1 },
    reminder_offsets: [1440],
    created_by: 'm-ben',
    created_at: new Date().toISOString()
  }
];

// ---- Chores ----------------------------------------------------------------
// Tuned for ages 16/14/11. Older kids get higher payouts, more responsibility.

const THIS_WEEK = isoWeekStr();

function stdChore(partial: Omit<Chore, 'mode' | 'rotation_roster' | 'rotation_pointer' | 'rotation_anchor_iso_week' | 'roster_role_name'>): Chore {
  return { ...partial, mode: 'standard', rotation_roster: [], rotation_pointer: 0, rotation_anchor_iso_week: null, roster_role_name: null };
}

export const DEMO_CHORES: Chore[] = [
  stdChore({
    id: 'c-1',
    family_id: 'fam-ellis',
    title: 'Make your bed',
    description: null,
    assigned_to: ['m-sophie', 'm-henry', 'm-laura'],
    frequency: 'daily',
    weekdays: [],
    payout: { stars: 2 },
    active_from: daysAgoISO(30),
    requires_photo: false,
    requires_approval: false,
    archived: false,
    created_at: new Date().toISOString()
  }),
  // Rotated: Sophie & Henry take turns emptying the dishwasher each day
  {
    id: 'c-2',
    family_id: 'fam-ellis',
    title: 'Empty dishwasher',
    description: 'Put everything away properly',
    assigned_to: ['m-sophie', 'm-henry'],
    frequency: 'daily',
    weekdays: [],
    payout: { stars: 5 },
    active_from: daysAgoISO(30),
    requires_photo: false,
    requires_approval: false,
    archived: false,
    created_at: new Date().toISOString(),
    mode: 'rotated',
    rotation_roster: ['m-sophie', 'm-henry'],
    rotation_pointer: 0,
    rotation_anchor_iso_week: THIS_WEEK,
    roster_role_name: null
  },
  stdChore({
    id: 'c-3',
    family_id: 'fam-ellis',
    title: 'Feed the dog',
    description: null,
    assigned_to: ['m-laura'],
    frequency: 'daily',
    weekdays: [],
    payout: { stars: 3 },
    active_from: daysAgoISO(30),
    requires_photo: false,
    requires_approval: false,
    archived: false,
    created_at: new Date().toISOString()
  }),
  stdChore({
    id: 'c-4',
    family_id: 'fam-ellis',
    title: 'Vacuum living room',
    description: 'Properly — under the couch too',
    assigned_to: ['m-henry'],
    frequency: 'weekly',
    weekdays: [6],
    payout: { stars: 15, screen_minutes: 15 },
    active_from: daysAgoISO(30),
    requires_photo: true,
    requires_approval: true,
    archived: false,
    created_at: new Date().toISOString()
  }),
  // Roster role: bins person rotates weekly between Sophie & Henry
  {
    id: 'c-5',
    family_id: 'fam-ellis',
    title: 'Take out the bins',
    description: null,
    assigned_to: ['m-sophie', 'm-henry'],
    frequency: 'weekly',
    weekdays: [2],
    payout: { stars: 8 },
    active_from: daysAgoISO(30),
    requires_photo: false,
    requires_approval: false,
    archived: false,
    created_at: new Date().toISOString(),
    mode: 'roster_role',
    rotation_roster: ['m-sophie', 'm-henry'],
    rotation_pointer: 0,
    rotation_anchor_iso_week: THIS_WEEK,
    roster_role_name: 'Bins person'
  },
  stdChore({
    id: 'c-6',
    family_id: 'fam-ellis',
    title: 'Clean your bathroom',
    description: 'Sink, mirror, toilet, mop floor',
    assigned_to: ['m-sophie'],
    frequency: 'weekly',
    weekdays: [0],
    payout: { stars: 25, savings_cents: 200 },
    active_from: daysAgoISO(30),
    requires_photo: true,
    requires_approval: true,
    archived: false,
    created_at: new Date().toISOString()
  }),
  stdChore({
    id: 'c-7',
    family_id: 'fam-ellis',
    title: 'Tidy bedroom',
    description: 'Floor visible, clothes away',
    assigned_to: ['m-laura'],
    frequency: 'weekly',
    weekdays: [0],
    payout: { stars: 10 },
    active_from: daysAgoISO(30),
    requires_photo: true,
    requires_approval: true,
    archived: false,
    created_at: new Date().toISOString()
  }),
  stdChore({
    id: 'c-8',
    family_id: 'fam-ellis',
    title: 'Help with dinner prep',
    description: "Chop, stir, set table — whatever's needed",
    assigned_to: ['m-sophie', 'm-henry', 'm-laura'],
    frequency: 'weekdays',
    weekdays: [],
    payout: { stars: 4 },
    active_from: daysAgoISO(30),
    requires_photo: false,
    requires_approval: false,
    archived: false,
    created_at: new Date().toISOString()
  })
];

// ---- A few historical completions so the UI isn't empty --------------------

export const DEMO_COMPLETIONS: ChoreCompletion[] = [
  {
    id: 'cc-1',
    chore_id: 'c-1',
    family_id: 'fam-ellis',
    member_id: 'm-sophie',
    for_date: daysAgoISO(1),
    status: 'approved',
    photo_url: null,
    payout: { stars: 2 },
    approved_by: null,
    approved_at: new Date(Date.now() - 86400000).toISOString(),
    note: null,
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'cc-2',
    chore_id: 'c-3',
    family_id: 'fam-ellis',
    member_id: 'm-laura',
    for_date: daysAgoISO(1),
    status: 'approved',
    photo_url: null,
    payout: { stars: 3 },
    approved_by: null,
    approved_at: new Date(Date.now() - 86400000).toISOString(),
    note: null,
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'cc-3',
    chore_id: 'c-2',
    family_id: 'fam-ellis',
    member_id: 'm-henry',
    for_date: daysAgoISO(1),
    status: 'approved',
    photo_url: null,
    payout: { stars: 5 },
    approved_by: null,
    approved_at: new Date(Date.now() - 86400000).toISOString(),
    note: null,
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

export const DEMO_REDEMPTIONS: Redemption[] = [];

// ---- Goals -----------------------------------------------------------------

export const DEMO_GOALS: RewardGoal[] = [
  {
    id: 'g-1',
    family_id: 'fam-ellis',
    member_id: 'm-sophie',
    title: 'AirPods',
    category: 'savings_cents',
    target_amount: 25000,
    achieved_at: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'g-2',
    family_id: 'fam-ellis',
    member_id: 'm-henry',
    title: 'New skateboard deck',
    category: 'savings_cents',
    target_amount: 12000,
    achieved_at: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'g-3',
    family_id: 'fam-ellis',
    member_id: 'm-laura',
    title: 'LEGO Friends set',
    category: 'savings_cents',
    target_amount: 6000,
    achieved_at: null,
    created_at: new Date().toISOString()
  }
];

// ---- PIN helpers (demo-mode only) ------------------------------------------

/**
 * Tiny synchronous "hash" — NOT cryptographic. Just enough to avoid storing
 * PINs as plain text in localStorage during demo mode. Real hashing happens
 * server-side via Supabase RLS policies + Postgres functions.
 */
export function hashPinSync(pin: string): string {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) + h + pin.charCodeAt(i)) | 0;
  }
  return 'demo-' + Math.abs(h).toString(36);
}

export function verifyPinSync(pin: string, hash: string | null): boolean {
  if (!hash) return true;
  return hashPinSync(pin) === hash;
}

// ---- Lists (Phase 3) -------------------------------------------------------

export const DEMO_LISTS: TodoList[] = [
  {
    id: 'l-house',
    family_id: 'fam-ellis',
    name: 'House admin',
    owner_id: null,
    icon: 'Wrench',
    color: 'sage',
    archived: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'l-hardware',
    family_id: 'fam-ellis',
    name: 'Hardware store',
    owner_id: null,
    icon: 'Hammer',
    color: 'terracotta',
    archived: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'l-sophie-school',
    family_id: 'fam-ellis',
    name: 'Sophie school',
    owner_id: 'm-sophie',
    icon: 'GraduationCap',
    color: 'rose',
    archived: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'l-ben-personal',
    family_id: 'fam-ellis',
    name: "Ben's list",
    owner_id: 'm-ben',
    icon: 'CircleUserRound',
    color: 'terracotta',
    archived: false,
    created_at: new Date().toISOString()
  }
];

function listItem(
  id: string,
  list_id: string,
  title: string,
  opts: Partial<TodoItem> = {}
): TodoItem {
  return {
    id,
    list_id,
    family_id: 'fam-ellis',
    title,
    notes: null,
    done: false,
    done_at: null,
    repeat: 'never',
    next_due: null,
    due_date: null,
    assigned_to: null,
    position: 0,
    created_at: new Date().toISOString(),
    ...opts
  };
}

export const DEMO_LIST_ITEMS: TodoItem[] = [
  // House admin — repeating maintenance tasks
  listItem('li-1', 'l-house', 'Test smoke alarm batteries', {
    repeat: 'biannually',
    position: 0
  }),
  listItem('li-2', 'l-house', 'Service air conditioner', {
    repeat: 'yearly',
    position: 1
  }),
  listItem('li-3', 'l-house', 'Wash windows', {
    repeat: 'biannually',
    position: 2
  }),
  listItem('li-4', 'l-house', 'Pay car insurance', {
    repeat: 'yearly',
    position: 3,
    assigned_to: 'm-ben'
  }),
  listItem('li-5', 'l-house', 'Replace water filter', {
    repeat: 'quarterly',
    position: 4
  }),

  // Hardware store — one-offs
  listItem('li-6', 'l-hardware', 'Picture hooks (medium)', { position: 0 }),
  listItem('li-7', 'l-hardware', 'Light bulbs — kitchen', { position: 1 }),
  listItem('li-8', 'l-hardware', 'Garden hose connector', { position: 2 }),

  // Sophie school
  listItem('li-9', 'l-sophie-school', 'Permission slip — excursion', {
    position: 0,
    due_date: localISODaysAgo(-5)
  }),
  listItem('li-10', 'l-sophie-school', 'Order new uniform shirt', { position: 1 }),

  // Ben personal
  listItem('li-11', 'l-ben-personal', 'Book dentist', { position: 0 }),
  listItem('li-12', 'l-ben-personal', 'Renew passport', {
    position: 1,
    due_date: localISODaysAgo(-30)
  })
];

// ---- Habits (Phase 3) ------------------------------------------------------

export const DEMO_HABITS: Habit[] = [
  {
    id: 'h-1',
    family_id: 'fam-ellis',
    member_id: 'm-sophie',
    title: 'Read 20 minutes',
    description: 'Before bed',
    cadence: 'daily',
    visibility: 'shared',
    streak_rewards: true,
    archived: false,
    count_mode: false,
    daily_target: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 'h-2',
    family_id: 'fam-ellis',
    member_id: 'm-henry',
    title: 'Practise piano',
    description: '15 minutes',
    cadence: 'weekdays',
    visibility: 'shared',
    streak_rewards: true,
    archived: false,
    count_mode: false,
    daily_target: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 'h-3',
    family_id: 'fam-ellis',
    member_id: 'm-laura',
    title: 'Brush teeth (morning + night)',
    description: null,
    cadence: 'daily',
    visibility: 'shared',
    streak_rewards: false,
    archived: false,
    count_mode: false,
    daily_target: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 'h-4',
    family_id: 'fam-ellis',
    member_id: 'm-ben',
    title: 'Morning walk',
    description: null,
    cadence: 'daily',
    visibility: 'private',
    streak_rewards: false,
    archived: false,
    count_mode: false,
    daily_target: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 'h-5',
    family_id: 'fam-ellis',
    member_id: 'm-susan',
    title: 'Yoga',
    description: null,
    cadence: 'weekly',
    visibility: 'shared',
    streak_rewards: false,
    archived: false,
    count_mode: false,
    daily_target: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 'h-6',
    family_id: 'fam-ellis',
    member_id: 'm-sophie',
    title: 'Glasses of water',
    description: null,
    cadence: 'daily',
    visibility: 'shared',
    streak_rewards: false,
    archived: false,
    count_mode: true,
    daily_target: 8,
    created_at: new Date().toISOString()
  }
];

// Seed a few historical check-ins so streaks aren't empty
function checkIn(id: string, habit_id: string, member_id: string, daysAgo: number): HabitCheckIn {
  return {
    id,
    habit_id,
    family_id: 'fam-ellis',
    member_id,
    for_date: daysAgoISO(daysAgo),
    created_at: new Date(Date.now() - daysAgo * 86400000).toISOString()
  };
}

export const DEMO_HABIT_CHECKINS: HabitCheckIn[] = [
  // Sophie reading — 4-day streak
  checkIn('hc-1', 'h-1', 'm-sophie', 1),
  checkIn('hc-2', 'h-1', 'm-sophie', 2),
  checkIn('hc-3', 'h-1', 'm-sophie', 3),
  checkIn('hc-4', 'h-1', 'm-sophie', 4),
  // Henry piano — yesterday only (rebuilding streak)
  checkIn('hc-5', 'h-2', 'm-henry', 1),
  // Laura teeth — solid streak going
  checkIn('hc-6', 'h-3', 'm-laura', 1),
  checkIn('hc-7', 'h-3', 'm-laura', 2),
  checkIn('hc-8', 'h-3', 'm-laura', 3),
  // Ben walks — most days
  checkIn('hc-9', 'h-4', 'm-ben', 1),
  checkIn('hc-10', 'h-4', 'm-ben', 3)
];

// ---- Location presets (Phase 3) --------------------------------------------

/**
 * Quick-pick location options for the manual status picker.
 * The "Away til..." option is special — it asks for a date.
 */
export const LOCATION_PRESETS = [
  { label: 'Home', icon: 'Home' },
  { label: 'School', icon: 'GraduationCap' },
  { label: 'Work', icon: 'Briefcase' },
  { label: 'Out', icon: 'Coffee' },
  { label: 'Travelling', icon: 'Plane' }
] as const;

// ---- Activity pool (My Day — Phase 4) --------------------------------------

export const DEMO_ACTIVITY_POOL: ActivityPoolItem[] = [
  {
    id: 'ap-1',
    family_id: 'fam-ellis',
    member_id: 'm-henry',
    title: 'Reading',
    icon: 'BookOpen',
    default_duration_min: 20,
    usage_count: 0,
    archived: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'ap-2',
    family_id: 'fam-ellis',
    member_id: 'm-henry',
    title: 'Piano practice',
    icon: 'Music',
    default_duration_min: 15,
    usage_count: 0,
    archived: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'ap-3',
    family_id: 'fam-ellis',
    member_id: 'm-henry',
    title: 'Homework',
    icon: 'Pencil',
    default_duration_min: 30,
    usage_count: 0,
    archived: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'ap-4',
    family_id: 'fam-ellis',
    member_id: 'm-henry',
    title: 'Outdoor play',
    icon: 'TreePine',
    default_duration_min: 30,
    usage_count: 0,
    archived: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'ap-5',
    family_id: 'fam-ellis',
    member_id: 'm-henry',
    title: 'Screen time',
    icon: 'Gamepad2',
    default_duration_min: 30,
    usage_count: 0,
    archived: false,
    created_at: new Date().toISOString()
  }
];
