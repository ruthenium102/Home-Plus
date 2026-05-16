// Core domain types for Home Plus.
// These mirror the Supabase schema in /supabase/schema.sql.

export type Role = 'parent' | 'child';

export type MemberColor =
  | 'terracotta'
  | 'sage'
  | 'sand'
  | 'dusty-blue'
  | 'plum'
  | 'rose'
  | 'olive'
  | 'slate';

export interface FamilyMember {
  id: string;
  family_id: string;
  name: string;
  role: Role;
  color: MemberColor;
  avatar_url: string | null; // optional uploaded photo
  pin_hash: string | null;   // null => no PIN required (e.g. small kids)
  birthday: string | null;   // ISO date
  current_location: string | null; // e.g. "School", "Shanghai til Fri"
  // Optional: when a temporary location should auto-revert. ISO timestamp.
  location_until: string | null;
  reward_balances: Record<string, number>; // e.g. { stars: 142, screen_minutes: 45 }
  my_day_enabled: boolean;
  chores_enabled: boolean;
  habits_enabled: boolean;
  kitchen_enabled: boolean;
  pet_enabled: boolean;
  email: string | null;
  auth_user_id?: string | null; // links this profile to a Supabase auth user
  created_at: string;
}

export interface Family {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
}

export type EventCategory =
  | 'general'
  | 'school'
  | 'work'
  | 'sport'
  | 'medical'
  | 'social'
  | 'travel'
  | 'meal';

export interface CalendarEvent {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  start_at: string; // ISO datetime
  end_at: string;   // ISO datetime
  all_day: boolean;
  location: string | null;
  category: EventCategory;
  // Members this event applies to. Empty = whole family.
  member_ids: string[];
  // Recurrence — null for one-off. Otherwise an RRULE-like minimal struct.
  recurrence: Recurrence | null;
  // Reminder offsets in minutes before start (e.g. [10, 60])
  reminder_offsets: number[];
  created_by: string | null; // member id
  created_at: string;
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // every N freq units
  byweekday?: number[]; // 0=Sun..6=Sat
  until?: string | null; // ISO date end, optional
  count?: number | null; // OR an occurrence count
}

export type ThemeMode = 'light' | 'dark' | 'system';

// Active "session" identity on the tablet — which member is currently using it.
export interface ActiveSession {
  member_id: string;
  authenticated_at: number; // ms epoch
}

// ============================================================================
// Chores & Rewards (Phase 2)
// ============================================================================

/**
 * Reward categories define the "currencies" kids can earn and spend.
 * Stars are the universal default. Screen time and savings are the other
 * two seeded categories.
 */
export type RewardCategoryKey = 'stars' | 'screen_minutes' | 'savings_cents';

export interface RewardCategory {
  key: RewardCategoryKey;
  label: string;        // "Stars", "Screen time", "Savings"
  unit: string;         // "★", "min", "$"
  // Approval threshold — redemptions ABOVE this need parent approval.
  // null means always auto. 0 means always require approval.
  auto_approve_under: number | null;
}

export type ChoreFrequency =
  | 'daily'
  | 'weekly'
  | 'weekdays'   // Mon-Fri
  | 'weekend'    // Sat-Sun
  | 'monthly'
  | 'one_off';

/**
 * standard: all assigned_to members do it every time (original behaviour).
 * rotated: one member per week takes responsibility; cycles through rotation_roster.
 * roster_role: same weekly cycle but the chore carries a named role label
 *   (e.g. "Bins person") that is displayed on the member strip.
 */
export type ChoreMode = 'standard' | 'rotated' | 'roster_role';

export interface Chore {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  // Who's responsible. Empty = unassigned (any kid can claim).
  assigned_to: string[]; // member ids
  frequency: ChoreFrequency;
  // Specific weekdays for 'weekly' (0=Sun..6=Sat). For weekdays/weekend this is derived.
  weekdays: number[];
  // What this chore pays out per completion. Map of category → amount.
  payout: Partial<Record<RewardCategoryKey, number>>;
  // ISO date this chore became active. Future-dated chores don't show up yet.
  active_from: string;
  // Optional: photo proof required before parent approves
  requires_photo: boolean;
  // Optional: needs explicit parent approval (vs auto-credit on tap)
  requires_approval: boolean;
  archived: boolean;
  created_at: string;
  // Rotation fields (used when mode !== 'standard')
  mode: ChoreMode;
  rotation_roster: string[]; // ordered member ids for rotation
  rotation_pointer: number;  // base index into rotation_roster
  rotation_anchor_iso_week: string | null; // YYYY-Www when rotation was anchored
  roster_role_name: string | null; // label for roster_role mode e.g. "Bins person"
}

/**
 * One row per chore-instance per day. Created lazily when a kid taps complete
 * (or when a parent assigns ad-hoc). Status flows:
 *   pending_approval → approved (paid out) | rejected (no payout)
 *   approved is terminal.
 *   If chore.requires_approval is false, status starts as 'approved'.
 */
export type ChoreCompletionStatus = 'pending_approval' | 'approved' | 'rejected';

export interface ChoreCompletion {
  id: string;
  chore_id: string;
  family_id: string;
  member_id: string;             // who completed it
  for_date: string;              // YYYY-MM-DD — which scheduled day this is for
  status: ChoreCompletionStatus;
  photo_url: string | null;
  payout: Partial<Record<RewardCategoryKey, number>>; // captured at completion time
  approved_by: string | null;    // parent member id
  approved_at: string | null;
  note: string | null;
  created_at: string;
}

/**
 * Spending side of the economy. Kid taps "redeem 30 min of screen time" —
 * this row is created. Status:
 *   pending_approval → approved (deducted) | rejected (no deduction)
 *   pending_payout (auto-approved redemptions stay here briefly until applied)
 */
export type RedemptionStatus = 'pending_approval' | 'approved' | 'rejected';

export interface Redemption {
  id: string;
  family_id: string;
  member_id: string;
  category: RewardCategoryKey;
  amount: number;                // positive number; deducted from balance
  reason: string;                // "30 min Switch time", "saving toward LEGO"
  status: RedemptionStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

/**
 * Kids' savings goals — visible on Home and on the Chores tab.
 * Progress = sum of their savings_cents balance toward this goal.
 */
export interface RewardGoal {
  id: string;
  family_id: string;
  member_id: string;
  title: string;                 // "LEGO Speed Champions"
  category: RewardCategoryKey;   // usually savings_cents or stars
  target_amount: number;         // in the category's smallest unit
  achieved_at: string | null;    // ISO when achieved
  created_at: string;
}

// ============================================================================
// Lists (Phase 3)
// ============================================================================

/**
 * A named list. Examples: "Hardware store", "House admin", "Sophie school".
 * Can be shared with everyone or private to one member.
 */
export interface TodoList {
  id: string;
  family_id: string;
  name: string;
  // null = shared with everyone in the family.
  // member id = private to that member.
  owner_id: string | null;
  // Visual flair — picks a Lucide icon name. Optional.
  icon: string | null;
  // Optional accent colour (uses MemberColor palette for consistency).
  color: MemberColor | null;
  archived: boolean;
  created_at: string;
}

export type ListItemRepeat =
  | 'never'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'biannually'
  | 'yearly';

/**
 * An item on a list. Repeating items reset to "not done" on the cadence.
 * `due_date` is optional — many list items are just "do whenever".
 */
export interface TodoItem {
  id: string;
  list_id: string;
  family_id: string;
  title: string;
  notes: string | null;
  done: boolean;
  done_at: string | null;
  // Repeating tasks: when done is set, we schedule the next occurrence.
  repeat: ListItemRepeat;
  // The next time this should re-appear as "not done", if repeating.
  next_due: string | null; // ISO date
  due_date: string | null; // ISO date — for one-off items
  // Optional assignee for shared lists (e.g. dad does the bins, mum does the bills)
  assigned_to: string | null;
  position: number; // for manual ordering within a list
  created_at: string;
}

// ============================================================================
// Habits (Phase 3)
// ============================================================================

export type HabitCadence = 'daily' | 'weekdays' | 'weekend' | 'weekly';

/**
 * A habit being tracked. Owner picks private or shared at creation.
 * Kids' habits can pay out stars on streak milestones (7-day, 30-day).
 */
export interface Habit {
  id: string;
  family_id: string;
  member_id: string;          // who owns this habit
  title: string;
  description: string | null;
  cadence: HabitCadence;
  // 'private' = only owner sees it. 'shared' = visible to whole family.
  visibility: 'private' | 'shared';
  // Optional: pay X stars when streak hits 7, 30, 100. Only relevant for kids.
  streak_rewards: boolean;
  archived: boolean;
  count_mode: boolean;     // if true, track quantity instead of done/not-done
  daily_target: number;    // target count per day (default 1)
  created_at: string;
}

export interface HabitCheckIn {
  id: string;
  habit_id: string;
  family_id: string;
  member_id: string;
  for_date: string; // YYYY-MM-DD
  count?: number;  // default 1; used to store the quantity checked in
  created_at: string;
}

// ============================================================================
// My Day (Phase 4)
// ============================================================================

export type DayPlanSection = 'morning' | 'afternoon' | 'evening';
export type DayPlanBlockSource = 'chore' | 'habit' | 'other' | 'event';

export interface DayPlanBlock {
  id: string;
  family_id: string;
  member_id: string;
  date: string; // YYYY-MM-DD
  section: DayPlanSection;
  source: DayPlanBlockSource;
  source_id: string;
  title: string;
  icon: string | null;
  duration_min: number;
  position: number;
  done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface ActivityPoolItem {
  id: string;
  family_id: string;
  member_id: string;
  title: string;
  icon: string | null;
  default_duration_min: number;
  usage_count: number;
  archived: boolean;
  created_at: string;
}

// ============================================================================
// Kitchen Plus (Phase 5)
// ============================================================================

export interface Ingredient {
  quantity: number | null;
  unit: string;
  item: string;
}

export interface Recipe {
  id: string;
  family_id: string;
  title: string;
  icon: string | null;
  servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  notes: string | null;
  source_url: string | null;
  favorite: boolean;
  created_by: string | null;
  created_at: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealPlan {
  id: string;
  family_id: string;
  recipe_id: string;
  date: string; // YYYY-MM-DD
  meal_type: MealType;
  servings: number;
  calendar_event_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface KitchenSettings {
  cupboard: string[];
  primary_shop_day: number | null; // 0=Sun..6=Sat
  mid_week_shop_enabled: boolean;
  mid_week_shop_day: number | null;
  meal_color?: string; // hex colour for meal events in calendar
}

// ============================================================================
// Virtual Pet (Phase 6)
// ============================================================================

export type PetAnimal = 'cat' | 'dog' | 'bunny' | 'hamster' | 'axolotl' | 'dragon' | 'custom';

// Eye placement for custom pets, in 0..1 coordinates relative to the
// processed pet image. Drawn over the image by PetEyes.
export interface CustomPetEyes {
  left: { x: number; y: number };
  right: { x: number; y: number };
  // Iris radius as a fraction of image width (e.g. 0.05). Tuned in the editor.
  radius: number;
}

export interface VirtualPet {
  id: string;
  family_id: string;
  member_id: string;
  animal: PetAnimal;
  name: string;
  hunger: number;
  thirst: number;
  happiness: number;
  xp: number;
  unlocked_actions: string[];
  last_fed_at: string | null;
  last_watered_at: string | null;
  last_interacted_at: string | null;
  created_at: string;
  // Currently-worn accessory ids (e.g. 'top_hat', 'red_collar'). Defaults to [].
  // Stored in-memory + localStorage only; not synced to Supabase schema.
  accessories: string[];
  // Custom pet data — only set when animal === 'custom'. Same localStorage-only
  // storage pattern as accessories.
  custom_image_data?: string | null; // data: URL of processed PNG
  custom_eyes?: CustomPetEyes | null;
}
