// Supabase Database type — hand-written from supabase/schema.sql.
// Maps every synced table to its Row/Insert/Update shape so the typed
// client (createClient<Database>) infers query results correctly and
// callers don't need `as unknown as` casts.
//
// If/when the Supabase CLI is wired up, replace this file with the
// output of `supabase gen types typescript`.

import type {
  ActivityPoolItem,
  CalendarEvent,
  Chore,
  ChoreCompletion,
  DayPlanBlock,
  Family,
  FamilyMember,
  Habit,
  HabitCheckIn,
  MealPlan,
  Recipe,
  Redemption,
  RewardGoal,
  TodoItem,
  TodoList,
  VirtualPet,
  KitchenSettings,
} from './index';

// All Home Plus rows share the same insert/update shape as the row,
// optionally permitting partial updates (Postgres is forgiving on missing
// columns that have defaults).
type TableShape<TRow> = {
  Row: TRow;
  Insert: TRow;
  Update: Partial<TRow>;
};

// `families` adds the owner_user_id FK that we don't carry on the Family
// TS type (it's only set on insert during signup).
type FamilyRow = Family & { owner_user_id?: string };

export interface Database {
  public: {
    Tables: {
      families: TableShape<FamilyRow>;
      family_members: TableShape<FamilyMember>;
      events: TableShape<CalendarEvent>;
      chores: TableShape<Chore>;
      chore_completions: TableShape<ChoreCompletion>;
      todo_lists: TableShape<TodoList>;
      todo_items: TableShape<TodoItem>;
      habits: TableShape<Habit>;
      habit_check_ins: TableShape<HabitCheckIn>;
      reward_goals: TableShape<RewardGoal>;
      redemptions: TableShape<Redemption>;
      day_plan_blocks: TableShape<DayPlanBlock>;
      activity_pool_items: TableShape<ActivityPoolItem>;
      recipes: TableShape<Recipe>;
      meal_plans: TableShape<MealPlan>;
      virtual_pets: TableShape<VirtualPet>;
      kitchen_settings: TableShape<KitchenSettings>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
