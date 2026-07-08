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

// client_errors is write-only telemetry (migrate_v26): the client INSERTs and
// can never read it back, so it gets a bespoke insert shape (id/created_at
// are DB defaults) instead of the shared TableShape.
type ClientErrorInsert = {
  auth_user_id: string;
  message: string;
  stack?: string | null;
  source?: string | null;
  app_version?: string | null;
  user_agent?: string | null;
};

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
      client_errors: {
        Row: ClientErrorInsert & { id: string; created_at: string };
        Insert: ClientErrorInsert;
        Update: Partial<ClientErrorInsert>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      // S1 — PIN RPCs (hash lives in the SECURITY-DEFINER-only member_pins table)
      set_member_pin: {
        Args: { member: string; pin: string | null };
        Returns: undefined;
      };
      verify_member_pin: {
        Args: { member: string; pin: string };
        Returns: boolean;
      };
      // S3 — server-authoritative reward RPCs
      redeem_reward: {
        Args: {
          p_member: string;
          p_category: string;
          p_amount: number;
          p_reason: string;
          p_status: string;
        };
        Returns: Redemption;
      };
      set_redemption_status: {
        Args: { p_id: string; p_status: string };
        Returns: Redemption;
      };
      apply_chore_payout: {
        Args: { p_member: string; p_payout: Record<string, number>; p_direction: number };
        Returns: undefined;
      };
      set_completion_status: {
        Args: { p_id: string; p_status: string };
        Returns: ChoreCompletion;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
