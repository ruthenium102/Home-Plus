import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { localISO } from '@/lib/dates';
import {
  dbUpsert,
  dbDelete,
  dbLoadFamily,
  dbCreateFamily,
  isPendingWrite,
  setDbErrorHandler,
  isCloud,
  rpcSetMemberPin,
  rpcVerifyMemberPin,
  rpcRedeemReward,
  rpcSetRedemptionStatus,
  rpcApplyChorePayout,
  rpcSetCompletionStatus,
  loadWindowSince,
  loadWindowSinceDate,
} from '@/lib/db';
import { useToast } from '@/context/ToastContext';
import { syncEventToGoogle, unsyncEventFromGoogle } from '@/lib/googleSync';
import { hapticLight, hapticMedium } from '@/lib/native';
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
  verifyPinSync,
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
  KitchenSettings,
  MealPlan,
  MealType,
  CustomPetEyes,
  PetAnimal,
  Redemption,
  Recipe,
  RewardCategory,
  RewardCategoryKey,
  RewardGoal,
  TodoItem,
  TodoList,
  VirtualPet,
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
  signInAs: (memberId: string, pin: string | null) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;

  // Events
  addEvent: (e: Omit<CalendarEvent, 'id' | 'created_at' | 'family_id'>) => string;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;

  // Members
  addMember: (m: Omit<FamilyMember, 'id' | 'created_at' | 'family_id'>) => void;
  updateMember: (id: string, patch: Partial<FamilyMember>) => void;
  deleteMember: (id: string) => void;
  /** Move a member one step up or down in the display order. */
  moveMember: (id: string, direction: 'up' | 'down') => void;
  /** Replace the display order for members with a full list of IDs. */
  reorderMembers: (orderedIds: string[]) => void;
  reorderHabits: (orderedIds: string[]) => void;
  reorderChores: (orderedIds: string[]) => void;
  reorderLists: (orderedIds: string[]) => void;
  /** Update positions on items within a single list (uses TodoItem.position). */
  reorderListItems: (listId: string, orderedItemIds: string[]) => void;
  setMemberPin: (id: string, pin: string | null) => Promise<void>;
  setMemberLocation: (id: string, location: string | null, until: string | null) => void;

  // Chores
  addChore: (c: Omit<Chore, 'id' | 'created_at' | 'family_id'>) => string;
  updateChore: (id: string, patch: Partial<Chore>) => void;
  deleteChore: (id: string) => void;
  completeChore: (choreId: string, memberId: string, forDate: string) => ChoreCompletion;
  deleteCompletion: (completionId: string) => void;
  approveCompletion: (completionId: string, approverId: string) => void;
  rejectCompletion: (completionId: string, approverId: string) => void;

  // Redemptions
  requestRedemption: (
    memberId: string,
    category: RewardCategoryKey,
    amount: number,
    reason: string,
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
  addListItem: (item: Omit<TodoItem, 'id' | 'created_at' | 'family_id'>) => string;
  updateListItem: (id: string, patch: Partial<TodoItem>) => void;
  toggleListItem: (id: string) => void;
  deleteListItem: (id: string) => void;

  // Habits
  addHabit: (h: Omit<Habit, 'id' | 'created_at' | 'family_id'>) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleCheckIn: (habitId: string, memberId: string, forDate: string) => void;
  incrementCheckIn: (habitId: string, memberId: string, forDate: string) => void;
  decrementCheckIn: (habitId: string, memberId: string, forDate: string) => void;

  // My Day
  dayPlanBlocks: DayPlanBlock[];
  activityPool: ActivityPoolItem[];
  addDayPlanBlock: (block: Omit<DayPlanBlock, 'id' | 'created_at' | 'family_id'>) => DayPlanBlock;
  updateDayPlanBlock: (id: string, patch: Partial<DayPlanBlock>) => void;
  removeDayPlanBlock: (id: string) => void;
  reorderDayPlanBlocks: (
    updates: { id: string; position: number; section: DayPlanSection }[],
  ) => void;
  toggleBlockDone: (id: string) => void;
  addPoolItem: (item: Omit<ActivityPoolItem, 'id' | 'created_at' | 'family_id'>) => void;
  updatePoolItem: (id: string, patch: Partial<ActivityPoolItem>) => void;
  archivePoolItem: (id: string) => void;

  // Kitchen
  recipes: Recipe[];
  mealPlans: MealPlan[];
  kitchenSettings: KitchenSettings;
  addRecipe: (r: Omit<Recipe, 'id' | 'created_at' | 'family_id'>) => void;
  updateRecipe: (id: string, patch: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  toggleRecipeFavorite: (id: string) => void;
  addMealPlan: (mp: Omit<MealPlan, 'id' | 'created_at' | 'family_id'>) => void;
  removeMealPlan: (id: string) => void;
  /** Move a placed meal to another day (in place: keeps ids, shifts its linked event). */
  moveMealPlan: (id: string, newDate: string) => void;
  /** Edit a placed meal's type/servings/notes; re-times the linked event if the type changed. */
  updateMealPlan: (
    id: string,
    patch: Partial<Pick<MealPlan, 'meal_type' | 'servings' | 'notes'>>,
  ) => void;
  /**
   * Replicate an existing meal plan onto the given weekdays (0=Sun..6=Sat)
   * for the next `weeks` weeks (starting from the source plan's week).
   * Existing meal plans on the same date + meal type are skipped.
   */
  repeatMealPlan: (sourceMealPlanId: string, weekdays: number[], weeks: number) => void;
  updateKitchenSettings: (patch: Partial<KitchenSettings>) => void;

  // Virtual Pet
  pets: VirtualPet[];
  getPet: (memberId: string) => VirtualPet | null;
  createPet: (
    memberId: string,
    animal: PetAnimal,
    name: string,
    custom?: { image: string; eyes: CustomPetEyes } | null,
  ) => void;
  setPetCustomDrawing: (memberId: string, image: string, eyes: CustomPetEyes) => void;
  feedPet: (memberId: string) => void;
  waterPet: (memberId: string) => void;
  patPet: (memberId: string) => void;
  playWithPet: (memberId: string) => void;
  wearAccessory: (memberId: string, accessoryId: string) => void;
  removeAccessory: (memberId: string, accessoryId: string) => void;
  gainXp: (memberId: string, amount: number) => void;

  // Invite flow
  needsPasswordSetup: boolean;
  clearNeedsPasswordSetup: () => void;

  /**
   * Force a re-fetch from Supabase for the current family.id and replace
   * local state. Returns ok + an optional error string so callers can
   * surface the underlying problem to the user.
   */
  reloadFromCloud: () => Promise<{ ok: boolean; error?: string }>;
  /** True while a reload is in flight, for spinner UI. */
  reloading: boolean;
  /** ms-epoch of the last successful cloud reload (0 if none this session). */
  lastReloadAt: number;
  /** Device connectivity, seeded from navigator.onLine + online/offline events.
   *  When false, writes aren't reaching Supabase — surfaced on the SyncIndicator. */
  online: boolean;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

// Persists a slice to localStorage whenever it changes.
//
// Debounced (400ms trailing) so a burst of edits — typing in a field, ticking
// several list items, dragging a reorder — coalesces into a single
// JSON.stringify + write instead of serializing the whole slice on the main
// thread on every keystroke/toggle. A pagehide / visibility-hidden flush
// guarantees the latest value is written before iOS suspends the WebView, so
// the debounce never risks losing data.
function usePersisted<T>(key: string, value: T) {
  const ref = useRef(value);
  ref.current = value;

  useEffect(() => {
    const id = window.setTimeout(() => storage.set(key, ref.current), 400);
    return () => window.clearTimeout(id);
  }, [key, value]);

  useEffect(() => {
    const flush = () => storage.set(key, ref.current);
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [key]);
}

const SESSION_KEY = 'session';
const FAMILY_KEY = 'demo:family';
const EVENTS_KEY = 'demo:events';
const MEMBERS_KEY = 'demo:members';
const MEMBER_ORDER_KEY = 'demo:member_order';
const HABIT_ORDER_KEY = 'demo:habit_order';
const CHORE_ORDER_KEY = 'demo:chore_order';
const LIST_ORDER_KEY = 'demo:list_order';
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
const RECIPES_KEY = 'demo:recipes';
const MEAL_PLANS_KEY = 'demo:meal_plans';
const KITCHEN_SETTINGS_KEY = 'kitchen:settings';
const PETS_KEY = 'demo:pets';

const DEFAULT_KITCHEN_SETTINGS: KitchenSettings = {
  cupboard: [],
  primary_shop_day: null,
  mid_week_shop_enabled: false,
  mid_week_shop_day: null,
};

// When Supabase auth is configured we start with a blank slate — no demo seed.
const LIVE = isSupabaseConfigured;

function uid(_prefix?: string) {
  return crypto.randomUUID();
}

/**
 * Compute streak length for a habit by looking at consecutive check-ins
 * working backwards from today.
 */
function computeStreak(checkIns: HabitCheckIn[], habitId: string, memberId: string): number {
  const dates = new Set(
    checkIns
      .filter((c) => c.habit_id === habitId && c.member_id === memberId)
      .map((c) => c.for_date),
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
  100: 200,
};

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [family, setFamily] = useState<Family>(() =>
    storage.get<Family>(FAMILY_KEY, LIVE ? DEMO_FAMILY : DEMO_FAMILY),
  );
  const [members, setMembers] = useState<FamilyMember[]>(() =>
    storage.get<FamilyMember[]>(MEMBERS_KEY, LIVE ? [] : DEMO_MEMBERS),
  );
  // Ordered list of member ids — pure UI ordering, kept in localStorage only.
  // Members missing from this list fall back to their natural array order.
  const [memberOrder, setMemberOrder] = useState<string[]>(() =>
    storage.get<string[]>(MEMBER_ORDER_KEY, []),
  );
  const [habitOrder, setHabitOrder] = useState<string[]>(() =>
    storage.get<string[]>(HABIT_ORDER_KEY, []),
  );
  const [choreOrder, setChoreOrder] = useState<string[]>(() =>
    storage.get<string[]>(CHORE_ORDER_KEY, []),
  );
  const [listOrder, setListOrder] = useState<string[]>(() =>
    storage.get<string[]>(LIST_ORDER_KEY, []),
  );
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    storage.get<CalendarEvent[]>(EVENTS_KEY, LIVE ? [] : DEMO_EVENTS),
  );
  const [chores, setChores] = useState<Chore[]>(() =>
    storage.get<Chore[]>(CHORES_KEY, LIVE ? [] : DEMO_CHORES),
  );
  const [completions, setCompletions] = useState<ChoreCompletion[]>(() =>
    storage.get<ChoreCompletion[]>(COMPLETIONS_KEY, LIVE ? [] : DEMO_COMPLETIONS),
  );
  const [redemptions, setRedemptions] = useState<Redemption[]>(() =>
    storage.get<Redemption[]>(REDEMPTIONS_KEY, LIVE ? [] : DEMO_REDEMPTIONS),
  );
  const [goals, setGoals] = useState<RewardGoal[]>(() =>
    storage.get<RewardGoal[]>(GOALS_KEY, LIVE ? [] : DEMO_GOALS),
  );
  const [lists, setLists] = useState<TodoList[]>(() =>
    storage.get<TodoList[]>(LISTS_KEY, LIVE ? [] : DEMO_LISTS),
  );
  const [listItems, setListItems] = useState<TodoItem[]>(() =>
    storage.get<TodoItem[]>(LIST_ITEMS_KEY, LIVE ? [] : DEMO_LIST_ITEMS),
  );
  const [habits, setHabits] = useState<Habit[]>(() =>
    storage.get<Habit[]>(HABITS_KEY, LIVE ? [] : DEMO_HABITS),
  );
  const [checkIns, setCheckIns] = useState<HabitCheckIn[]>(() =>
    storage.get<HabitCheckIn[]>(CHECKINS_KEY, LIVE ? [] : DEMO_HABIT_CHECKINS),
  );
  const [session, setSession] = useState<ActiveSession | null>(() =>
    storage.get<ActiveSession | null>(SESSION_KEY, null),
  );
  // Supabase auth user id (cloud mode). Used to auto-select the member that
  // logged in with their own credentials so we can skip the profile picker.
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [dayPlanBlocks, setDayPlanBlocks] = useState<DayPlanBlock[]>(() =>
    storage.get<DayPlanBlock[]>(DAY_PLAN_KEY, []),
  );
  const [activityPool, setActivityPool] = useState<ActivityPoolItem[]>(() =>
    storage.get<ActivityPoolItem[]>(ACTIVITY_POOL_KEY, LIVE ? [] : DEMO_ACTIVITY_POOL),
  );
  const [recipes, setRecipes] = useState<Recipe[]>(() => storage.get<Recipe[]>(RECIPES_KEY, []));
  const [mealPlans, setMealPlans] = useState<MealPlan[]>(() =>
    storage.get<MealPlan[]>(MEAL_PLANS_KEY, []),
  );
  const [kitchenSettings, setKitchenSettings] = useState<KitchenSettings>(() =>
    storage.get<KitchenSettings>(KITCHEN_SETTINGS_KEY, DEFAULT_KITCHEN_SETTINGS),
  );
  const [pets, setPets] = useState<VirtualPet[]>(() => storage.get<VirtualPet[]>(PETS_KEY, []));
  // Latest members, readable from stable callbacks without re-subscribing.
  const membersRef = useRef<FamilyMember[]>([]);
  membersRef.current = members;
  // Persist a pet to the cloud ONLY if its member belongs to the current
  // family. Pets carried over from demo mode (or any orphaned local pet) have a
  // member_id that isn't in family_members, which would violate the FK and
  // surface as a "Couldn't save virtual_pets" error. Demo mode is a no-op in
  // dbUpsert regardless.
  const persistPet = useCallback((pet: VirtualPet) => {
    if (!membersRef.current.some((m) => m.id === pet.member_id)) return;
    dbUpsert('virtual_pets', pet);
  }, []);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(
    () => sessionStorage.getItem('needs_password_setup') === '1',
  );

  // Surface silent dbUpsert/dbDelete failures via toast. Without this, a
  // failed Supabase write (RLS rejection, enum mismatch, etc) only logged to
  // console and then the row got nuked by the next reconcile poll — which
  // showed up as "I saved it but it disappeared".
  const { show: showToast } = useToast();
  useEffect(() => {
    setDbErrorHandler(({ table, op, message }) => {
      showToast({
        message: `Couldn't ${op === 'upsert' ? 'save' : 'delete'} ${table}: ${message}`,
        duration: 8000,
      });
    });
    return () => setDbErrorHandler(null);
  }, [showToast]);

  // Hydrate pet state from the cloud on load, merging in any pet that exists
  // only on this device (created before pets were server-synced) and pushing
  // those local-only pets up so they're durable from now on. Cloud rows win
  // for members that exist in both places.
  const hydratePets = useCallback((cloudPets: VirtualPet[]) => {
    setPets((local) => {
      const cloudMemberIds = new Set(cloudPets.map((p) => p.member_id));
      const localOnly = local.filter((p) => !cloudMemberIds.has(p.member_id));
      // One-time seed: persist device-only pets to Supabase so a future
      // reinstall keeps them — but only those belonging to a real family member
      // (persistPet drops orphaned/demo pets that would violate the FK).
      for (const p of localOnly) persistPet(p);
      return [...cloudPets, ...localOnly];
    });
  }, [persistPet]);

  // On auth, load data from Supabase. On first login, create the initial family.
  const handled = useRef(false);
  // Latest reloadFromCloud(), so the realtime channel effect (which only
  // depends on family.id) can trigger a catch-up reload on reconnect without
  // resubscribing every time the callback identity changes.
  const reloadRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!LIVE || !supabase) return;

    const handleAuth = async (
      userId: string | null,
      userMeta: Record<string, unknown> | null,
      userEmail: string | null,
    ) => {
      if (!userId || handled.current) return;
      handled.current = true;

      // 1. Check if this user already has a family in Supabase
      const { data: memberRow } = await supabase!
        .from('family_members')
        .select('family_id')
        .eq('auth_user_id', userId)
        .maybeSingle();

      const existingFamilyId = memberRow?.family_id as string | null;

      if (existingFamilyId) {
        // 2. Load the full family from Supabase and hydrate state
        const data = await dbLoadFamily(existingFamilyId);
        if (data) {
          setFamily(data.family);
          setMembers(data.members);
          setEvents(data.events);
          setChores(data.chores);
          setCompletions(data.completions);
          setLists(data.lists);
          setListItems(data.listItems);
          setHabits(data.habits);
          setCheckIns(data.checkIns);
          setGoals(data.goals);
          setRedemptions(data.redemptions);
          setDayPlanBlocks(data.dayPlanBlocks);
          setActivityPool(data.activityPool);
          setRecipes(data.recipes);
          setMealPlans(data.mealPlans);
          hydratePets(data.pets);

          // Auto sign-in as the member linked to this auth user
          const mine = data.members.find((m) => m.auth_user_id === userId);
          if (mine) {
            const sess: ActiveSession = { member_id: mine.id, authenticated_at: Date.now() };
            storage.set(SESSION_KEY, sess);
            setSession(sess);
            // Backfill the email onto the member row if missing — covers users
            // (esp. the family owner) created before email was being saved.
            if (userEmail && !mine.email) {
              await supabase!.from('family_members').update({ email: userEmail }).eq('id', mine.id);
              setMembers((prev) =>
                prev.map((m) => (m.id === mine.id ? { ...m, email: userEmail } : m)),
              );
            }
          }
          return;
        }
      }

      // 3. Check for a pending invite token (user arrived via email invite link).
      //    Call accept_invitation() — it now returns the family_id directly
      //    so we don't need a second round-trip to find the row it just made.
      //    If no URL token is present, fall back to looking up a pending
      //    invitation by email (handles cases where the token got dropped
      //    from the URL by Supabase's #access_token redirect).
      const urlInvite = sessionStorage.getItem('pending_invite');
      let inviteToken: string | null = urlInvite;
      if (!inviteToken && userEmail) {
        const { data: pendingForEmail } = await supabase!
          .from('invitations')
          .select('token')
          .eq('email', userEmail)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        inviteToken = (pendingForEmail?.token as string | undefined) ?? null;
      }

      if (inviteToken) {
        if (urlInvite) sessionStorage.removeItem('pending_invite');

        let acceptedFamilyId: string | null = null;
        try {
          const { data: rpcData, error: rpcErr } = await supabase!.rpc(
            'accept_invitation',
            { p_token: inviteToken },
          );
          if (rpcErr) {
            console.warn('[handleAuth] accept_invitation error:', rpcErr);
          } else if (typeof rpcData === 'string') {
            acceptedFamilyId = rpcData;
          }
        } catch (e) {
          console.warn('[handleAuth] accept_invitation threw:', e);
        }

        // Fallback: if the RPC didn't return a uuid (e.g. older SQL still
        // deployed), look the row up by auth_user_id.
        if (!acceptedFamilyId) {
          const { data: newMemberRow } = await supabase!
            .from('family_members')
            .select('family_id')
            .eq('auth_user_id', userId)
            .maybeSingle();
          acceptedFamilyId = (newMemberRow?.family_id as string | null) ?? null;
        }

        if (acceptedFamilyId) {
          const data = await dbLoadFamily(acceptedFamilyId);
          if (data) {
            setFamily(data.family);
            setMembers(data.members);
            setEvents(data.events);
            setChores(data.chores);
            setCompletions(data.completions);
            setLists(data.lists);
            setListItems(data.listItems);
            setHabits(data.habits);
            setCheckIns(data.checkIns);
            setGoals(data.goals);
            setRedemptions(data.redemptions);
            setDayPlanBlocks(data.dayPlanBlocks);
            setActivityPool(data.activityPool);
            setRecipes(data.recipes);
            setMealPlans(data.mealPlans);
            hydratePets(data.pets);
            const mine = data.members.find((m) => m.auth_user_id === userId);
            if (mine) {
              const sess: ActiveSession = { member_id: mine.id, authenticated_at: Date.now() };
              storage.set(SESSION_KEY, sess);
              setSession(sess);
              if (userEmail && !mine.email) {
                await supabase!
                  .from('family_members')
                  .update({ email: userEmail })
                  .eq('id', mine.id);
              }
              // Prompt for password setup only if the user didn't just choose
              // one (AuthPage's signUp sets `password_chosen` when the user
              // creates their account with a password). Users who arrived via
              // Supabase's inviteUserByEmail magic link bypass AuthPage and
              // have no password — they need the modal.
              const passwordChosen = sessionStorage.getItem('password_chosen') === '1';
              sessionStorage.removeItem('password_chosen');
              if (!passwordChosen) {
                sessionStorage.setItem('needs_password_setup', '1');
                setNeedsPasswordSetup(true);
              }
            }
          }
          return;
        }
      }

      // 4. No Supabase family yet — check localStorage for data created before sync
      const localMembers = storage.get<FamilyMember[]>(MEMBERS_KEY, []);
      const localFamily = storage.get<Family>(FAMILY_KEY, DEMO_FAMILY);

      if (localMembers.length > 0 && localFamily.id !== DEMO_FAMILY.id) {
        // Push existing local data up to Supabase
        await supabase!.from('families').upsert({
          id: localFamily.id,
          name: localFamily.name,
          timezone: localFamily.timezone,
          owner_user_id: userId,
          created_at: localFamily.created_at,
        });
        for (const m of localMembers) {
          const isOwner = m.id === localMembers[0]?.id;
          await supabase!.from('family_members').upsert({
            ...m,
            auth_user_id: isOwner ? userId : (m.auth_user_id ?? null),
          });
        }
        return;
      }

      // 4. Truly fresh signup — create family + member in Supabase and local state
      const name = (userMeta?.name as string) || userEmail?.split('@')[0] || 'You';
      const familyName = (userMeta?.family_name as string) || 'My Family';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const familyId = crypto.randomUUID();
      const memberId = crypto.randomUUID();
      const now = new Date().toISOString();

      const newFamily: Family = {
        id: familyId,
        name: familyName,
        timezone: tz,
        // L1/L2/L4 — carry the sign-up acceptance/attestation timestamps that
        // AuthContext.signUp stamped into user_metadata onto the durable row.
        tos_accepted_at: (userMeta?.tos_accepted_at as string) ?? null,
        privacy_accepted_at: (userMeta?.privacy_accepted_at as string) ?? null,
        owner_attested_adult_at: (userMeta?.owner_attested_adult_at as string) ?? null,
        created_at: now,
      };
      const newMember: FamilyMember = {
        id: memberId,
        family_id: familyId,
        name,
        role: 'parent',
        color: 'terracotta',
        avatar_url: null,
        has_pin: false,
        pin_hash: null,
        birthday: null,
        current_location: null,
        location_until: null,
        reward_balances: {},
        my_day_enabled: false,
        chores_enabled: true,
        habits_enabled: true,
        kitchen_enabled: false,
        pet_enabled: false,
        email: userEmail,
        auth_user_id: userId,
        created_at: now,
      };

      await dbCreateFamily(newFamily, newMember, userId);

      setFamily(newFamily);
      setMembers([newMember]);
      const sess: ActiveSession = { member_id: memberId, authenticated_at: Date.now() };
      storage.set(SESSION_KEY, sess);
      setSession(sess);
    };

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setAuthUserId(u?.id ?? null);
      handleAuth(u?.id ?? null, u?.user_metadata ?? null, u?.email ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Reset handled flag on sign-out so next sign-in re-runs
      if (!sess) {
        handled.current = false;
        setAuthUserId(null);
        return;
      }
      const u = sess.user;
      setAuthUserId(u?.id ?? null);
      handleAuth(u?.id ?? null, u?.user_metadata ?? null, u?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Realtime subscriptions — keep all devices in sync
  useEffect(() => {
    if (!LIVE || !supabase || !family.id || family.id === DEMO_FAMILY.id) return;
    const fid = family.id;

    // Skip applying the remote change if our local write for this row is still
    // pending — otherwise an echo of stale server state can clobber the just-
    // made optimistic edit.
    const upsertById = <T extends { id: string }>(
      table: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      item: T,
    ) =>
      setter((prev) => {
        if (isPendingWrite(table, item.id)) return prev;
        return prev.some((x) => x.id === item.id)
          ? prev.map((x) => (x.id === item.id ? item : x))
          : [...prev, item];
      });
    const removeById = <T extends { id: string }>(
      table: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      id: string,
    ) =>
      setter((prev) => {
        if (isPendingWrite(table, id)) return prev;
        return prev.filter((x) => x.id !== id);
      });

    // Data-driven realtime subscription config: one entry per synced table.
    // Each entry tells the channel which setter to call on insert/update and
    // delete. Adding a new table only needs an extra row, not another .on().
    const subs: Array<{
      table: string;
      setter: React.Dispatch<React.SetStateAction<{ id: string }[]>>;
    }> = [
      { table: 'family_members', setter: setMembers as never },
      { table: 'events', setter: setEvents as never },
      { table: 'chores', setter: setChores as never },
      { table: 'chore_completions', setter: setCompletions as never },
      { table: 'todo_lists', setter: setLists as never },
      { table: 'todo_items', setter: setListItems as never },
      { table: 'habits', setter: setHabits as never },
      { table: 'habit_check_ins', setter: setCheckIns as never },
      { table: 'reward_goals', setter: setGoals as never },
      { table: 'redemptions', setter: setRedemptions as never },
      { table: 'day_plan_blocks', setter: setDayPlanBlocks as never },
      { table: 'activity_pool_items', setter: setActivityPool as never },
      { table: 'recipes', setter: setRecipes as never },
      { table: 'meal_plans', setter: setMealPlans as never },
      { table: 'virtual_pets', setter: setPets as never },
    ];

    // Realtime channel with auto-resubscribe (arch 🟡). WKWebView can drop the
    // WebSocket on iOS background/network flaps; the channel then sits in
    // CHANNEL_ERROR / TIMED_OUT / CLOSED and stops delivering events silently.
    // We watch the subscribe() status and rebuild the channel on failure with
    // a capped backoff, and do a one-shot reloadFromCloud() to catch up any
    // changes missed while disconnected.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retry = 0;
    let retryTimer: number | null = null;
    let disposed = false;

    const buildChannel = () => {
      let ch = supabase!.channel(`hp-${fid}`);
      for (const { table, setter } of subs) {
        ch = ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `family_id=eq.${fid}` },
          ({ eventType, new: n, old: o }) => {
            if (eventType === 'DELETE') {
              removeById(table, setter, (o as { id: string }).id);
            } else {
              upsertById(table, setter, n as { id: string });
            }
          },
        );
      }
      ch.subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          // Fresh (re)connection — pull anything missed while we were down.
          if (retry > 0) reloadRef.current?.();
          retry = 0;
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          if (retryTimer != null) return; // already scheduled
          const delay = Math.min(30_000, 1_000 * 2 ** retry);
          retry += 1;
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            if (disposed) return;
            if (channel) supabase!.removeChannel(channel);
            channel = buildChannel();
          }, delay);
        }
      });
      return ch;
    };

    channel = buildChannel();

    return () => {
      disposed = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      if (channel) supabase!.removeChannel(channel);
    };
  }, [family.id]);

  // Persist each slice to localStorage when it changes. usePersisted is a
  // tiny wrapper around the previous one-effect-per-slice pattern; behaviour
  // is identical (write only when that specific slice changes) but the
  // wall-of-useEffects collapses to one line per key.
  usePersisted(FAMILY_KEY, family);
  usePersisted(MEMBERS_KEY, members);
  usePersisted(MEMBER_ORDER_KEY, memberOrder);
  usePersisted(HABIT_ORDER_KEY, habitOrder);
  usePersisted(CHORE_ORDER_KEY, choreOrder);
  usePersisted(LIST_ORDER_KEY, listOrder);
  usePersisted(EVENTS_KEY, events);
  usePersisted(CHORES_KEY, chores);
  usePersisted(COMPLETIONS_KEY, completions);
  usePersisted(REDEMPTIONS_KEY, redemptions);
  usePersisted(GOALS_KEY, goals);
  usePersisted(LISTS_KEY, lists);
  usePersisted(LIST_ITEMS_KEY, listItems);
  usePersisted(HABITS_KEY, habits);
  usePersisted(CHECKINS_KEY, checkIns);
  usePersisted(DAY_PLAN_KEY, dayPlanBlocks);
  usePersisted(ACTIVITY_POOL_KEY, activityPool);
  usePersisted(RECIPES_KEY, recipes);
  usePersisted(MEAL_PLANS_KEY, mealPlans);
  usePersisted(KITCHEN_SETTINGS_KEY, kitchenSettings);
  usePersisted(PETS_KEY, pets);
  useEffect(() => {
    if (session) storage.set(SESSION_KEY, session);
    else storage.remove(SESSION_KEY);
  }, [session]);

  const activeMember = useMemo(
    () => (session ? (members.find((m) => m.id === session.member_id) ?? null) : null),
    [session, members],
  );

  // Auto-select the member linked to the signed-in auth user. Someone who
  // logged in with their own email/password IS that member, so we skip the
  // "Who's using Home Plus?" picker (and any PIN). This is reactive so it also
  // covers paths where the member links/hydrates after auth resolves. The
  // in-app switch-user button still lets a shared device change profiles.
  useEffect(() => {
    if (session || !authUserId) return;
    const mine = members.find((m) => m.auth_user_id === authUserId);
    if (mine) {
      const sess: ActiveSession = { member_id: mine.id, authenticated_at: Date.now() };
      storage.set(SESSION_KEY, sess);
      setSession(sess);
    }
  }, [session, authUserId, members]);

  // Auto-revert "Away til..." when the until date passes.
  // Re-runs whenever members change (incl. async load from Supabase) so a
  // stale location_until doesn't linger after the app re-mounts. Also
  // persists via dbUpsert so the next realtime sync doesn't bring it back.
  useEffect(() => {
    const now = new Date();
    members.forEach((m) => {
      if (m.location_until && new Date(m.location_until) < now) {
        const cleared = { ...m, current_location: 'Home', location_until: null };
        setMembers((prev) => prev.map((x) => (x.id === m.id ? cleared : x)));
        dbUpsert('family_members', cleared);
      }
    });
  }, [members]);

  // ---- Virtual Pet helpers -------------------------------------------------

  function computePetStats(pet: VirtualPet): { hunger: number; thirst: number; happiness: number } {
    const now = Date.now();
    const hoursSince = (ts: string | null) =>
      ts ? (now - new Date(ts).getTime()) / 3600000 : null;

    const hungerElapsed = hoursSince(pet.last_fed_at);
    const hunger =
      hungerElapsed !== null
        ? Math.max(0, Math.min(100, pet.hunger - hungerElapsed * 8))
        : pet.hunger;

    const thirstElapsed = hoursSince(pet.last_watered_at);
    const thirst =
      thirstElapsed !== null
        ? Math.max(0, Math.min(100, pet.thirst - thirstElapsed * 12))
        : pet.thirst;

    const happinessElapsed = hoursSince(pet.last_interacted_at);
    const happiness =
      happinessElapsed !== null
        ? Math.max(0, Math.min(100, pet.happiness - happinessElapsed * 3))
        : pet.happiness;

    return { hunger, thirst, happiness };
  }

  function deriveUnlockedActions(xp: number): string[] {
    const actions: string[] = [];
    if (xp >= 50) actions.push('play');
    if (xp >= 150) actions.push('super_pat');
    if (xp >= 300) actions.push('trick');
    return actions;
  }

  // Sync pet XP whenever completions or checkIns change.
  // Note: only ADDS missing XP from chores/habits — won't subtract bonus XP
  // earned via mini-games (gainXp). We track a baseline-derived floor.
  useEffect(() => {
    if (pets.length === 0) return;
    setPets((prev) =>
      prev.map((pet) => {
        const memberCompletions = completions.filter(
          (c) => c.member_id === pet.member_id && c.status === 'approved',
        ).length;
        const memberCheckIns = checkIns.filter((c) => c.member_id === pet.member_id).length;
        const baselineXp = memberCompletions * 10 + memberCheckIns * 5;
        // Pet keeps the max of (baseline derived from chores/habits) and (current xp,
        // which may include mini-game bonuses).
        const newXp = Math.max(pet.xp, baselineXp);
        if (newXp === pet.xp) return pet;
        const unlocked_actions = deriveUnlockedActions(newXp);
        const updated = { ...pet, xp: newXp, unlocked_actions };
        persistPet(updated);
        return updated;
      }),
    );
     
  }, [completions, checkIns]);

  // Backfill `accessories` on pets created before the field existed.
  useEffect(() => {
    if (pets.length === 0) return;
    if (pets.every((p) => Array.isArray(p.accessories))) return;
    setPets((prev) =>
      prev.map((p) => (Array.isArray(p.accessories) ? p : { ...p, accessories: [] })),
    );
     
  }, []);

  // ---- Auth ----------------------------------------------------------------

  const signInAs = useCallback(
    async (memberId: string, pin: string | null): Promise<{ ok: boolean; error?: string }> => {
      const m = members.find((x) => x.id === memberId);
      if (!m) return { ok: false, error: 'Member not found' };
      if (m.has_pin) {
        if (!pin) return { ok: false, error: 'PIN required' };
        // Cloud mode verifies server-side (the hash never leaves the DB);
        // demo mode falls back to the local non-crypto hash.
        const ok = isCloud()
          ? await rpcVerifyMemberPin(memberId, pin)
          : verifyPinSync(pin, m.pin_hash ?? null);
        if (!ok) return { ok: false, error: 'Wrong PIN' };
      }
      setSession({ member_id: memberId, authenticated_at: Date.now() });
      return { ok: true };
    },
    [members],
  );

  const signOut = useCallback(() => setSession(null), []);

  // ---- Manual cloud reload + auto-refresh on tab visibility ----------------

  const [reloading, setReloading] = useState(false);
  const [lastReloadAt, setLastReloadAt] = useState(0);

  // Device connectivity. Seeded from navigator.onLine and kept current via the
  // browser online/offline events, so the SyncIndicator can show when writes
  // aren't reaching the server.
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Returns a functional state updater that merges polled cloud data with
  // local state, preserving rows that have pending local writes (so an in-
  // flight optimistic edit isn't clobbered by a poll snapshot from before
  // the write landed). Locally-deleted rows that are pending stay deleted;
  // locally-created rows that haven't propagated yet are preserved.
  const mergePolled =
    <T extends { id: string }>(table: string, polled: T[]) =>
    (prev: T[]): T[] => {
      const prevById = new Map(prev.map((p) => [p.id, p]));
      const polledIds = new Set(polled.map((p) => p.id));
      const out: T[] = [];
      for (const p of polled) {
        if (isPendingWrite(table, p.id)) {
          const local = prevById.get(p.id);
          if (local) out.push(local); // local update still in flight — keep ours
          // else: locally deleted, in-flight — skip this polled row
        } else {
          out.push(p);
        }
      }
      for (const l of prev) {
        if (!polledIds.has(l.id) && isPendingWrite(table, l.id)) out.push(l);
      }
      return out;
    };

  const reloadFromCloud = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!LIVE || !supabase) return { ok: false, error: 'Supabase not configured (demo mode)' };
    if (!family.id || family.id === DEMO_FAMILY.id)
      return { ok: false, error: 'No real family loaded' };
    setReloading(true);
    try {
      // Step 1: try the canonical bulk load. If it returns data, we're done.
      const data = await dbLoadFamily(family.id);
      if (data) {
        setFamily(data.family);
        setMembers(mergePolled('family_members', data.members));
        setEvents(mergePolled('events', data.events));
        setChores(mergePolled('chores', data.chores));
        setCompletions(mergePolled('chore_completions', data.completions));
        setLists(mergePolled('todo_lists', data.lists));
        setListItems(mergePolled('todo_items', data.listItems));
        setHabits(mergePolled('habits', data.habits));
        setCheckIns(mergePolled('habit_check_ins', data.checkIns));
        setGoals(mergePolled('reward_goals', data.goals));
        setRedemptions(mergePolled('redemptions', data.redemptions));
        setDayPlanBlocks(mergePolled('day_plan_blocks', data.dayPlanBlocks));
        setActivityPool(mergePolled('activity_pool_items', data.activityPool));
        setRecipes(mergePolled('recipes', data.recipes));
        setMealPlans(mergePolled('meal_plans', data.mealPlans));
        setPets(mergePolled('virtual_pets', data.pets));
        setLastReloadAt(Date.now());
        return { ok: true };
      }

      // Step 2: bulk load failed — the families row is unreadable. Probe it
      // directly so we can surface the underlying error to the user, then
      // try a fallback that keeps the existing family object and refreshes
      // the per-table data anyway.
      const { error: fError } = await supabase!
        .from('families')
        .select('id')
        .eq('id', family.id)
        .maybeSingle();
      const fErrMsg = fError?.message;

      // Refresh per-table data without depending on families. Date-windowed to
      // match dbLoadFamily (A1) so the fallback path doesn't pull full history.
      const since = loadWindowSince();
      const sinceDate = loadWindowSinceDate();
      const probes = await Promise.all([
        supabase!.from('family_members').select('*').eq('family_id', family.id),
        supabase!
          .from('events')
          .select('*')
          .eq('family_id', family.id)
          .or(`start_at.gte.${since},recurrence.not.is.null`),
        supabase!.from('chores').select('*').eq('family_id', family.id),
        supabase!
          .from('chore_completions')
          .select('*')
          .eq('family_id', family.id)
          .gte('for_date', sinceDate),
        supabase!.from('todo_lists').select('*').eq('family_id', family.id),
        supabase!.from('todo_items').select('*').eq('family_id', family.id),
        supabase!.from('habits').select('*').eq('family_id', family.id),
        supabase!
          .from('habit_check_ins')
          .select('*')
          .eq('family_id', family.id)
          .gte('for_date', sinceDate),
        supabase!.from('reward_goals').select('*').eq('family_id', family.id),
        supabase!
          .from('redemptions')
          .select('*')
          .eq('family_id', family.id)
          .gte('created_at', since),
        supabase!
          .from('day_plan_blocks')
          .select('*')
          .eq('family_id', family.id)
          .gte('date', sinceDate),
        supabase!.from('activity_pool_items').select('*').eq('family_id', family.id),
        supabase!.from('recipes').select('*').eq('family_id', family.id),
        supabase!.from('meal_plans').select('*').eq('family_id', family.id),
        supabase!.from('virtual_pets').select('*').eq('family_id', family.id),
      ]);
      const [mems, evs, ch, cc, tl, ti, hb, hci, rg, rd, dpb, api, rec, mp, pts] = probes;
      setMembers(mergePolled('family_members', (mems.data ?? [])));
      setEvents(mergePolled('events', (evs.data ?? [])));
      setChores(mergePolled('chores', (ch.data ?? [])));
      setCompletions(
        mergePolled('chore_completions', (cc.data ?? [])),
      );
      setLists(mergePolled('todo_lists', (tl.data ?? [])));
      setListItems(mergePolled('todo_items', (ti.data ?? [])));
      setHabits(mergePolled('habits', (hb.data ?? [])));
      setCheckIns(mergePolled('habit_check_ins', (hci.data ?? [])));
      setGoals(mergePolled('reward_goals', (rg.data ?? [])));
      setRedemptions(mergePolled('redemptions', (rd.data ?? [])));
      setDayPlanBlocks(
        mergePolled('day_plan_blocks', (dpb.data ?? [])),
      );
      setActivityPool(
        mergePolled('activity_pool_items', (api.data ?? [])),
      );
      setRecipes(mergePolled('recipes', (rec.data ?? [])));
      setMealPlans(mergePolled('meal_plans', (mp.data ?? [])));
      setPets(mergePolled('virtual_pets', (pts.data ?? [])));
      setLastReloadAt(Date.now());

      const detail = fErrMsg
        ? `families read blocked: ${fErrMsg}`
        : `families row not found (id ${family.id.slice(-8)})`;
      return {
        ok: false,
        error: `Refreshed table data, but ${detail}. Apply the RLS migration in Supabase.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[reloadFromCloud] failed:', e);
      return { ok: false, error: msg };
    } finally {
      setReloading(false);
    }
  }, [family.id]);

  // Keep the ref the realtime channel uses for reconnect catch-up current.
  useEffect(() => {
    reloadRef.current = () => {
      void reloadFromCloud();
    };
  }, [reloadFromCloud]);

  // Re-fetch when the tab/app becomes visible again. Realtime sometimes drops
  // events when the WKWebView is paused (iOS app in background), so this
  // catches up automatically on resume.
  useEffect(() => {
    if (!LIVE || !supabase) return;
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      // Only refetch if we were actually hidden for more than 5s, to avoid
      // hammering the API on quick focus flips.
      if (hiddenAt && Date.now() - hiddenAt > 5_000) {
        reloadFromCloud();
      }
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadFromCloud]);

  // Periodic safety net. Capacitor WKWebView can silently drop the realtime
  // WebSocket while the app is foreground (we've observed list-item updates
  // not propagating across devices), so we poll as a backstop while the page
  // is visible. Raised from 20s → 90s (A1): the per-poll read is now date-
  // windowed and the realtime channel auto-resubscribes on drop (below), so a
  // tighter interval is unnecessary load. Skipped while hidden or while a
  // manual reload is in flight to avoid pile-ups.
  useEffect(() => {
    if (!LIVE || !supabase) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (reloading) return;
      reloadFromCloud();
    }, 90_000);
    return () => window.clearInterval(id);
  }, [reloadFromCloud, reloading]);

  // ---- Events --------------------------------------------------------------

  const addEvent = useCallback(
    (e: Omit<CalendarEvent, 'id' | 'created_at' | 'family_id'>): string => {
      const newEvent: CalendarEvent = {
        ...e,
        id: uid('e'),
        created_at: new Date().toISOString(),
        family_id: family.id,
      };
      setEvents((prev) => [...prev, newEvent]);
      dbUpsert('events', newEvent);
      syncEventToGoogle(newEvent.id);
      return newEvent.id;
    },
    [family.id],
  );

  const updateEvent = useCallback(
    (id: string, patch: Partial<CalendarEvent>) =>
      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const updated = { ...e, ...patch };
          dbUpsert('events', updated);
          syncEventToGoogle(updated.id);
          // If this is a meal event whose date changed, sync the linked meal
          // plan's date so the planner stays in lockstep with the calendar.
          if (updated.category === 'meal' && patch.start_at && patch.start_at !== e.start_at) {
            const newDate = updated.start_at.slice(0, 10);
            setMealPlans((mps) =>
              mps.map((mp) => {
                if (mp.calendar_event_id !== id || mp.date === newDate) return mp;
                const next = { ...mp, date: newDate };
                dbUpsert('meal_plans', next);
                return next;
              }),
            );
          }
          return updated;
        }),
      ),
    [],
  );

  const deleteEvent = useCallback(
    (id: string) => {
      // Remove any meal plan linked to this event so the planner and calendar
      // stay in sync when a meal is deleted from the calendar side.
      setMealPlans((mps) => {
        const linked = mps.filter((mp) => mp.calendar_event_id === id);
        linked.forEach((mp) => dbDelete('meal_plans', mp.id));
        return linked.length ? mps.filter((mp) => mp.calendar_event_id !== id) : mps;
      });
      // Capture the google_event_id BEFORE we drop the row from state, so the
      // sync endpoint doesn't have to race the Supabase delete to look it up.
      setEvents((prev) => {
        const target = prev.find((e) => e.id === id);
        unsyncEventFromGoogle(id, target?.google_event_id ?? null, family.id);
        return prev.filter((e) => e.id !== id);
      });
      dbDelete('events', id);
    },
    [family.id],
  );

  // ---- Members -------------------------------------------------------------

  const addMember = useCallback(
    (m: Omit<FamilyMember, 'id' | 'created_at' | 'family_id'>) => {
      const newMember: FamilyMember = {
        ...m,
        id: uid('m'),
        family_id: family.id,
        created_at: new Date().toISOString(),
      };
      setMembers((prev) => [...prev, newMember]);
      dbUpsert('family_members', newMember);
    },
    [family.id],
  );

  const updateMember = useCallback(
    (id: string, patch: Partial<FamilyMember>) =>
      setMembers((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const updated = { ...m, ...patch };
          dbUpsert('family_members', updated);
          return updated;
        }),
      ),
    [],
  );

  const deleteMember = useCallback((id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setMemberOrder((prev) => prev.filter((mid) => mid !== id));
    dbDelete('family_members', id);
  }, []);

  // Re-orders the member with `id` by one step in the given direction. Order
  // is stored in localStorage only; not synced to Supabase.
  const moveMember = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setMemberOrder((prev) => {
        // Build the current display order: start with any prior ordering,
        // then append any members not yet in the list (new joiners go last).
        const known = new Set(prev);
        const current = [
          ...prev.filter((mid) => members.some((m) => m.id === mid)),
          ...members.filter((m) => !known.has(m.id)).map((m) => m.id),
        ];
        const idx = current.indexOf(id);
        if (idx < 0) return current;
        const target = direction === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= current.length) return current;
        const next = current.slice();
        [next[idx], next[target]] = [next[target], next[idx]];
        return next;
      });
    },
    [members],
  );

  // Generic "save this list of IDs as the display order" for each kind.
  // Items not in the list keep their natural order at the tail (see the
  // sortedX selectors below).
  const reorderMembers = useCallback((orderedIds: string[]) => {
    setMemberOrder(orderedIds);
  }, []);
  const reorderHabits = useCallback((orderedIds: string[]) => {
    setHabitOrder(orderedIds);
  }, []);
  const reorderChores = useCallback((orderedIds: string[]) => {
    setChoreOrder(orderedIds);
  }, []);
  const reorderLists = useCallback((orderedIds: string[]) => {
    setListOrder(orderedIds);
  }, []);
  // Items within a single list have a real `position` field, so the order is
  // stored on the row rather than in localStorage. We rewrite the positions
  // of just the affected list, leaving others untouched.
  const reorderListItems = useCallback((listId: string, orderedItemIds: string[]) => {
    setListItems((prev) =>
      prev.map((item) => {
        if (item.list_id !== listId) return item;
        const newPos = orderedItemIds.indexOf(item.id);
        if (newPos < 0 || newPos === item.position) return item;
        const updated = { ...item, position: newPos };
        dbUpsert('todo_items', updated);
        return updated;
      }),
    );
  }, []);

  const setMemberPin = useCallback(async (id: string, pin: string | null) => {
    const hasPin = pin !== null;
    if (isCloud()) {
      // Cloud mode: the hash is written server-side via the RPC (it lands in
      // the SECURITY-DEFINER-only member_pins table and never touches the
      // client). We only mirror the readable has_pin indicator locally.
      await rpcSetMemberPin(id, pin);
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, has_pin: hasPin } : m)),
      );
      return;
    }
    // Demo mode: keep the local non-crypto hash so PIN gating works offline.
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, pin_hash: pin ? hashPinSync(pin) : null, has_pin: hasPin }
          : m,
      ),
    );
  }, []);

  const setMemberLocation = useCallback(
    (id: string, location: string | null, until: string | null) => {
      setMembers((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const updated = { ...m, current_location: location, location_until: until };
          dbUpsert('family_members', updated);
          return updated;
        }),
      );
    },
    [],
  );

  // ---- Chores --------------------------------------------------------------

  const addChore = useCallback(
    (c: Omit<Chore, 'id' | 'created_at' | 'family_id'>): string => {
      const newChore: Chore = {
        ...c,
        id: uid('c'),
        created_at: new Date().toISOString(),
        family_id: family.id,
      };
      setChores((prev) => [...prev, newChore]);
      dbUpsert('chores', newChore);
      return newChore.id;
    },
    [family.id],
  );

  const updateChore = useCallback(
    (id: string, patch: Partial<Chore>) =>
      setChores((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const updated = { ...c, ...patch };
          dbUpsert('chores', updated);
          return updated;
        }),
      ),
    [],
  );

  const deleteChore = useCallback((id: string) => {
    setChores((prev) => prev.filter((c) => c.id !== id));
    dbDelete('chores', id);
  }, []);

  function applyPayout(
    membersList: FamilyMember[],
    memberId: string,
    payout: ChoreCompletion['payout'],
    direction: 1 | -1 = 1,
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
      void hapticLight();

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
        created_at: new Date().toISOString(),
      };

      setCompletions((prev) => [...prev, completion]);
      dbUpsert('chore_completions', completion);

      if (status === 'approved') {
        // Optimistic local credit for snappy UX; the next poll reconciles.
        setMembers((prev) => applyPayout(prev, memberId, chore.payout, 1));
        // Cloud mode: balances are server-authoritative (S3), so the actual
        // credit must go through the RPC. Demo mode keeps the local update.
        if (isCloud()) void rpcApplyChorePayout(memberId, chore.payout, 1);
      }

      return completion;
    },
    [chores, family.id],
  );

  const deleteCompletion = useCallback((completionId: string) => {
    setCompletions((prev) => {
      const target = prev.find((c) => c.id === completionId);
      if (!target) return prev;
      if (target.status === 'approved') {
        setMembers((m) => applyPayout(m, target.member_id, target.payout, -1));
        // Cloud: reverse the credit server-side (S3). Demo: local only.
        if (isCloud()) void rpcApplyChorePayout(target.member_id, target.payout, -1);
      }
      dbDelete('chore_completions', completionId);
      return prev.filter((c) => c.id !== completionId);
    });
  }, []);

  const approveCompletion = useCallback((completionId: string, approverId: string) => {
    const cloud = isCloud();
    setCompletions((prev) => {
      const target = prev.find((c) => c.id === completionId);
      if (!target || target.status !== 'pending_approval') return prev;
      // Optimistic local credit; cloud mode reconciles from the RPC + poll.
      setMembers((m) => applyPayout(m, target.member_id, target.payout, 1));
      if (cloud) {
        // Server-authoritative (S3): the RPC flips status AND credits the
        // balance atomically, and enforces parent-only at the DB.
        void rpcSetCompletionStatus(completionId, 'approved');
      }
      return prev.map((c) => {
        if (c.id !== completionId) return c;
        const updated = {
          ...c,
          status: 'approved' as const,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        };
        if (!cloud) dbUpsert('chore_completions', updated);
        return updated;
      });
    });
  }, []);

  const rejectCompletion = useCallback((completionId: string, approverId: string) => {
    const cloud = isCloud();
    if (cloud) void rpcSetCompletionStatus(completionId, 'rejected');
    setCompletions((prev) =>
      prev.map((c) => {
        if (c.id !== completionId) return c;
        const updated = {
          ...c,
          status: 'rejected' as const,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        };
        if (!cloud) dbUpsert('chore_completions', updated);
        return updated;
      }),
    );
  }, []);

  // ---- Redemptions ---------------------------------------------------------

  const requestRedemption = useCallback(
    (memberId: string, category: RewardCategoryKey, amount: number, reason: string): Redemption => {
      void hapticMedium();
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
        created_at: new Date().toISOString(),
      };

      setRedemptions((prev) => [...prev, redemption]);

      if (isCloud()) {
        // Server-authoritative (S3): redeem_reward inserts the redemption and
        // (when pre-approved) debits the balance atomically at the DB.
        void rpcRedeemReward(
          memberId,
          category,
          amount,
          reason,
          autoApprove ? 'approved' : 'pending_approval',
        );
        if (autoApprove) {
          setMembers((prev) => applyPayout(prev, memberId, { [category]: amount } as any, -1));
        }
      } else {
        // Demo mode: persist + debit locally.
        dbUpsert('redemptions', redemption);
        if (autoApprove) {
          setMembers((prev) => applyPayout(prev, memberId, { [category]: amount } as any, -1));
        }
      }

      return redemption;
    },
    [family.id],
  );

  const approveRedemption = useCallback((id: string, approverId: string) => {
    const cloud = isCloud();
    setRedemptions((prev) => {
      const r = prev.find((x) => x.id === id);
      if (!r || r.status !== 'pending_approval') return prev;
      // Optimistic local debit; cloud mode reconciles from the RPC + poll.
      setMembers((m) => applyPayout(m, r.member_id, { [r.category]: r.amount } as any, -1));
      if (cloud) {
        // Server-authoritative (S3): RPC flips status AND debits atomically,
        // and enforces parent-only at the DB.
        void rpcSetRedemptionStatus(id, 'approved');
      }
      return prev.map((x) => {
        if (x.id !== id) return x;
        const updated = {
          ...x,
          status: 'approved' as const,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        };
        if (!cloud) dbUpsert('redemptions', updated);
        return updated;
      });
    });
  }, []);

  const rejectRedemption = useCallback((id: string, approverId: string) => {
    const cloud = isCloud();
    if (cloud) void rpcSetRedemptionStatus(id, 'rejected');
    setRedemptions((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        const updated = {
          ...x,
          status: 'rejected' as const,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        };
        if (!cloud) dbUpsert('redemptions', updated);
        return updated;
      }),
    );
  }, []);

  // ---- Goals ---------------------------------------------------------------

  const addGoal = useCallback(
    (g: Omit<RewardGoal, 'id' | 'created_at' | 'family_id' | 'achieved_at'>) => {
      const newGoal: RewardGoal = {
        ...g,
        id: uid('g'),
        created_at: new Date().toISOString(),
        family_id: family.id,
        achieved_at: null,
      };
      setGoals((prev) => [...prev, newGoal]);
      dbUpsert('reward_goals', newGoal);
    },
    [family.id],
  );

  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    dbDelete('reward_goals', id);
  }, []);

  // ---- Lists ---------------------------------------------------------------

  const addList = useCallback(
    (l: Omit<TodoList, 'id' | 'created_at' | 'family_id'>): string => {
      const id = uid('l');
      const newList: TodoList = {
        ...l,
        id,
        created_at: new Date().toISOString(),
        family_id: family.id,
      };
      setLists((prev) => [...prev, newList]);
      dbUpsert('todo_lists', newList);
      return id;
    },
    [family.id],
  );

  const updateList = useCallback(
    (id: string, patch: Partial<TodoList>) =>
      setLists((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          const updated = { ...l, ...patch };
          dbUpsert('todo_lists', updated);
          return updated;
        }),
      ),
    [],
  );

  const deleteList = useCallback((id: string) => {
    setLists((prev) => prev.filter((l) => l.id !== id));
    setListItems((prev) => prev.filter((i) => i.list_id !== id));
    dbDelete('todo_lists', id);
  }, []);

  const addListItem = useCallback(
    (item: Omit<TodoItem, 'id' | 'created_at' | 'family_id'>): string => {
      const newItem: TodoItem = {
        ...item,
        id: uid('li'),
        created_at: new Date().toISOString(),
        family_id: family.id,
      };
      setListItems((prev) => [...prev, newItem]);
      dbUpsert('todo_items', newItem);
      return newItem.id;
    },
    [family.id],
  );

  const updateListItem = useCallback(
    (id: string, patch: Partial<TodoItem>) =>
      setListItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          const updated = { ...i, ...patch };
          dbUpsert('todo_items', updated);
          return updated;
        }),
      ),
    [],
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
        const updated = {
          ...i,
          done: nowDone,
          done_at: nowDone ? new Date().toISOString() : null,
          next_due,
        };
        // Persist to Supabase so other devices (and our own next reload)
        // see the change. Previously this only updated local state, which
        // caused completed items to revert on the next poll.
        dbUpsert('todo_items', updated);
        return updated;
      }),
    );
  }, []);

  const deleteListItem = useCallback((id: string) => {
    setListItems((prev) => prev.filter((i) => i.id !== id));
    dbDelete('todo_items', id);
  }, []);

  // ---- Habits --------------------------------------------------------------

  const addHabit = useCallback(
    (h: Omit<Habit, 'id' | 'created_at' | 'family_id'>) => {
      const newHabit: Habit = {
        ...h,
        count_mode: h.count_mode ?? false,
        daily_target: h.daily_target ?? 1,
        id: uid('h'),
        created_at: new Date().toISOString(),
        family_id: family.id,
      };
      setHabits((prev) => [...prev, newHabit]);
      dbUpsert('habits', newHabit);
    },
    [family.id],
  );

  const updateHabit = useCallback(
    (id: string, patch: Partial<Habit>) =>
      setHabits((prev) =>
        prev.map((h) => {
          if (h.id !== id) return h;
          const updated = { ...h, ...patch };
          dbUpsert('habits', updated);
          return updated;
        }),
      ),
    [],
  );

  const deleteHabit = useCallback((id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    setCheckIns((prev) => prev.filter((c) => c.habit_id !== id));
    dbDelete('habits', id);
  }, []);

  const toggleCheckIn = useCallback(
    (habitId: string, memberId: string, forDate: string) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;
      void hapticLight();

      const existing = checkIns.find(
        (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === forDate,
      );

      if (existing) {
        setCheckIns((prev) => prev.filter((c) => c.id !== existing.id));
        dbDelete('habit_check_ins', existing.id);
        return;
      }

      const newCheckIn: HabitCheckIn = {
        id: uid('hc'),
        habit_id: habitId,
        family_id: family.id,
        member_id: memberId,
        for_date: forDate,
        created_at: new Date().toISOString(),
      };

      const nextCheckIns = [...checkIns, newCheckIn];
      setCheckIns(nextCheckIns);
      dbUpsert('habit_check_ins', newCheckIn);

      // Streak rewards — for kids on habits with streak_rewards enabled.
      // Awarded whenever a check-in causes the streak to land on a milestone,
      // including on backfilled days (per "kid-friendly but gameable" mode).
      const member = members.find((m) => m.id === memberId);
      if (member?.role === 'child' && habit.streak_rewards) {
        const streak = computeStreak(nextCheckIns, habitId, memberId);
        const reward = STREAK_MILESTONES[streak];
        if (reward) {
          // Optimistic local credit; cloud mode reconciles from the RPC + poll.
          setMembers((prev) =>
            prev.map((m) =>
              m.id === memberId
                ? {
                    ...m,
                    reward_balances: {
                      ...m.reward_balances,
                      stars: (m.reward_balances.stars || 0) + reward,
                    },
                  }
                : m,
            ),
          );
          // Cloud mode: balances are server-authoritative (S3).
          if (isCloud()) void rpcApplyChorePayout(memberId, { stars: reward }, 1);
        }
      }
    },
    [habits, checkIns, members, family.id],
  );

  const incrementCheckIn = useCallback(
    (habitId: string, memberId: string, forDate: string) => {
      void hapticLight();
      setCheckIns((prev) => {
        const existing = prev.find(
          (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === forDate,
        );
        if (existing) {
          const updated = { ...existing, count: (existing.count ?? 1) + 1 };
          dbUpsert('habit_check_ins', updated);
          return prev.map((c) => (c.id === existing.id ? updated : c));
        }
        const newCheckIn: HabitCheckIn = {
          id: uid('hc'),
          habit_id: habitId,
          family_id: family.id,
          member_id: memberId,
          for_date: forDate,
          count: 1,
          created_at: new Date().toISOString(),
        };
        dbUpsert('habit_check_ins', newCheckIn);
        return [...prev, newCheckIn];
      });
    },
    [family.id],
  );

  const decrementCheckIn = useCallback((habitId: string, memberId: string, forDate: string) => {
    setCheckIns((prev) => {
      const existing = prev.find(
        (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === forDate,
      );
      if (!existing) return prev;
      const currentCount = existing.count ?? 1;
      if (currentCount <= 1) {
        dbDelete('habit_check_ins', existing.id);
        return prev.filter((c) => c.id !== existing.id);
      }
      const updated = { ...existing, count: currentCount - 1 };
      dbUpsert('habit_check_ins', updated);
      return prev.map((c) => (c.id === existing.id ? updated : c));
    });
  }, []);

  // ---- My Day ----------------------------------------------------------------

  const addDayPlanBlock = useCallback(
    (block: Omit<DayPlanBlock, 'id' | 'created_at' | 'family_id'>): DayPlanBlock => {
      const newBlock: DayPlanBlock = {
        ...block,
        id: uid('dp'),
        created_at: new Date().toISOString(),
        family_id: family.id,
      };
      setDayPlanBlocks((prev) => [...prev, newBlock]);
      dbUpsert('day_plan_blocks', newBlock);
      if (block.source === 'other') {
        setActivityPool((prev) =>
          prev.map((p) => {
            if (p.id !== block.source_id) return p;
            const updated = { ...p, usage_count: p.usage_count + 1 };
            dbUpsert('activity_pool_items', updated);
            return updated;
          }),
        );
      }
      return newBlock;
    },
    [family.id],
  );

  const updateDayPlanBlock = useCallback(
    (id: string, patch: Partial<DayPlanBlock>) =>
      setDayPlanBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const updated = { ...b, ...patch };
          dbUpsert('day_plan_blocks', updated);
          return updated;
        }),
      ),
    [],
  );

  const removeDayPlanBlock = useCallback((id: string) => {
    setDayPlanBlocks((prev) => prev.filter((b) => b.id !== id));
    dbDelete('day_plan_blocks', id);
  }, []);

  const reorderDayPlanBlocks = useCallback(
    (updates: { id: string; position: number; section: DayPlanSection }[]) =>
      setDayPlanBlocks((prev) =>
        prev.map((b) => {
          const u = updates.find((x) => x.id === b.id);
          if (!u) return b;
          const updated = { ...b, position: u.position, section: u.section };
          dbUpsert('day_plan_blocks', updated);
          return updated;
        }),
      ),
    [],
  );

  const toggleBlockDone = useCallback(
    (id: string) =>
      setDayPlanBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const updated = {
            ...b,
            done: !b.done,
            done_at: !b.done ? new Date().toISOString() : null,
          };
          dbUpsert('day_plan_blocks', updated);
          return updated;
        }),
      ),
    [],
  );

  const addPoolItem = useCallback(
    (item: Omit<ActivityPoolItem, 'id' | 'created_at' | 'family_id'>) => {
      const newItem: ActivityPoolItem = {
        ...item,
        id: uid('ap'),
        created_at: new Date().toISOString(),
        family_id: family.id,
      };
      setActivityPool((prev) => [...prev, newItem]);
      dbUpsert('activity_pool_items', newItem);
    },
    [family.id],
  );

  const updatePoolItem = useCallback(
    (id: string, patch: Partial<ActivityPoolItem>) =>
      setActivityPool((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const updated = { ...p, ...patch };
          dbUpsert('activity_pool_items', updated);
          return updated;
        }),
      ),
    [],
  );

  const archivePoolItem = useCallback(
    (id: string) =>
      setActivityPool((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const updated = { ...p, archived: true };
          dbUpsert('activity_pool_items', updated);
          return updated;
        }),
      ),
    [],
  );

  // ---- Kitchen ---------------------------------------------------------------

  const addRecipe = useCallback(
    (r: Omit<Recipe, 'id' | 'created_at' | 'family_id'>) => {
      const newRecipe: Recipe = {
        ...r,
        id: uid('r'),
        created_at: new Date().toISOString(),
        family_id: family.id,
      };
      setRecipes((prev) => [...prev, newRecipe]);
      dbUpsert('recipes', newRecipe);
    },
    [family.id],
  );

  const updateRecipe = useCallback(
    (id: string, patch: Partial<Recipe>) =>
      setRecipes((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updated = { ...r, ...patch };
          dbUpsert('recipes', updated);
          return updated;
        }),
      ),
    [],
  );

  const deleteRecipe = useCallback(
    (id: string) => {
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      // Also remove any meal plans referencing this recipe
      setMealPlans((prev) => {
        const toRemove = prev.filter((m) => m.recipe_id === id);
        toRemove.forEach((m) => {
          dbDelete('meal_plans', m.id);
          const eid = m.calendar_event_id;
          if (eid) {
            setEvents((ev) => {
              const evt = ev.find((e) => e.id === eid);
              unsyncEventFromGoogle(eid, evt?.google_event_id ?? null, family.id);
              return ev.filter((e) => e.id !== eid);
            });
            dbDelete('events', eid);
          }
        });
        return prev.filter((m) => m.recipe_id !== id);
      });
      dbDelete('recipes', id);
    },
    [family.id],
  );

  const toggleRecipeFavorite = useCallback(
    (id: string) =>
      setRecipes((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updated = { ...r, favorite: !r.favorite };
          dbUpsert('recipes', updated);
          return updated;
        }),
      ),
    [],
  );

  const addMealPlan = useCallback(
    (mp: Omit<MealPlan, 'id' | 'created_at' | 'family_id'>) => {
      const recipe = recipes.find((r) => r.id === mp.recipe_id);
      const eventId = uid('e');
      const times = {
        breakfast: ['08:00', '09:00'],
        lunch: ['12:30', '13:30'],
        dinner: ['18:30', '20:00'],
        snack: ['15:00', '15:30'],
      };
      const [startTime, endTime] = times[mp.meal_type as MealType] ?? times.dinner;

      const newEvent: CalendarEvent = {
        id: eventId,
        family_id: family.id,
        title: recipe ? `${recipe.icon || '🍽️'} ${recipe.title}` : '🍽️ Meal',
        description: null,
        start_at: `${mp.date}T${startTime}:00`,
        end_at: `${mp.date}T${endTime}:00`,
        all_day: false,
        location: null,
        category: 'meal',
        member_ids: [],
        recurrence: null,
        reminder_offsets: [],
        created_by: activeMember?.id ?? null,
        created_at: new Date().toISOString(),
      };

      const newMealPlan: MealPlan = {
        ...mp,
        id: uid('mp'),
        family_id: family.id,
        calendar_event_id: eventId,
        created_at: new Date().toISOString(),
      };

      setEvents((prev) => [...prev, newEvent]);
      setMealPlans((prev) => [...prev, newMealPlan]);
      // The meal_plans row references the event via FK, so the event MUST land
      // first — these are separate requests with no inherent ordering otherwise.
      void dbUpsert('events', newEvent).then(() => dbUpsert('meal_plans', newMealPlan));
      syncEventToGoogle(newEvent.id);
    },
    [family.id, recipes, activeMember],
  );

  const removeMealPlan = useCallback(
    (id: string) => {
      // Resolve the linked event id BEFORE updating state, then do clean,
      // separate setState calls. (Nesting setEvents inside the setMealPlans
      // updater could skip the event removal, leaving it on the calendar.)
      const eid = mealPlans.find((m) => m.id === id)?.calendar_event_id ?? null;
      setMealPlans((prev) => prev.filter((m) => m.id !== id));
      dbDelete('meal_plans', id);
      if (eid) {
        setEvents((ev) => {
          const evt = ev.find((e) => e.id === eid);
          unsyncEventFromGoogle(eid, evt?.google_event_id ?? null, family.id);
          return ev.filter((e) => e.id !== eid);
        });
        dbDelete('events', eid);
      }
    },
    [mealPlans, family.id],
  );

  // Move a placed meal to a new day IN PLACE — update the meal_plans row's date
  // and shift its already-linked calendar event. We don't delete+recreate (that
  // races the events insert against the meal_plans FK on calendar_event_id).
  const moveMealPlan = useCallback(
    (id: string, newDate: string) => {
      const mp = mealPlans.find((m) => m.id === id);
      if (!mp || mp.date === newDate) return;
      const updated: MealPlan = { ...mp, date: newDate };
      setMealPlans((prev) => prev.map((m) => (m.id === id ? updated : m)));
      dbUpsert('meal_plans', updated);
      // Meal events store a naive `${date}THH:MM:SS`, so swap only the date
      // prefix to keep the time-of-day (robust even if the value carries a tz).
      if (mp.calendar_event_id) {
        const evt = events.find((e) => e.id === mp.calendar_event_id);
        if (evt) {
          updateEvent(evt.id, {
            start_at: newDate + evt.start_at.slice(10),
            end_at: newDate + evt.end_at.slice(10),
          });
        }
      }
    },
    [mealPlans, events, updateEvent],
  );

  const updateMealPlan = useCallback(
    (id: string, patch: Partial<Pick<MealPlan, 'meal_type' | 'servings' | 'notes'>>) => {
      const mp = mealPlans.find((m) => m.id === id);
      if (!mp) return;
      const updated: MealPlan = { ...mp, ...patch };
      setMealPlans((prev) => prev.map((m) => (m.id === id ? updated : m)));
      dbUpsert('meal_plans', updated);
      // Changing the meal type shifts the linked calendar event to that slot's time.
      if (patch.meal_type && patch.meal_type !== mp.meal_type && mp.calendar_event_id) {
        const evt = events.find((e) => e.id === mp.calendar_event_id);
        if (evt) {
          const times: Record<MealType, [string, string]> = {
            breakfast: ['08:00', '09:00'],
            lunch: ['12:30', '13:30'],
            dinner: ['18:30', '20:00'],
            snack: ['15:00', '15:30'],
          };
          const [startTime, endTime] = times[patch.meal_type] ?? times.dinner;
          const datePart = evt.start_at.slice(0, 10);
          updateEvent(evt.id, {
            start_at: `${datePart}T${startTime}:00`,
            end_at: `${datePart}T${endTime}:00`,
          });
        }
      }
    },
    [mealPlans, events, updateEvent],
  );

  const repeatMealPlan = useCallback(
    (sourceMealPlanId: string, weekdays: number[], weeks: number) => {
      const source = mealPlans.find((m) => m.id === sourceMealPlanId);
      if (!source || weekdays.length === 0 || weeks <= 0) return;
      const recipe = recipes.find((r) => r.id === source.recipe_id);
      const times = {
        breakfast: ['08:00', '09:00'],
        lunch: ['12:30', '13:30'],
        dinner: ['18:30', '20:00'],
        snack: ['15:00', '15:30'],
      };
      const [startTime, endTime] = times[source.meal_type as MealType] ?? times.dinner;
      const sourceDate = new Date(`${source.date}T00:00:00`);
      // Walk forward day by day for the requested span and pick any matching
      // weekday that doesn't already have a plan for this meal type.
      const newEvents: CalendarEvent[] = [];
      const newPlans: MealPlan[] = [];
      const totalDays = weeks * 7;
      for (let i = 1; i <= totalDays; i++) {
        const d = new Date(sourceDate.getTime());
        d.setDate(d.getDate() + i);
        const wd = d.getDay();
        if (!weekdays.includes(wd)) continue;
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const clash =
          mealPlans.some(
            (m) =>
              m.date === dateStr &&
              m.meal_type === source.meal_type &&
              m.recipe_id === source.recipe_id,
          ) || newPlans.some((m) => m.date === dateStr && m.meal_type === source.meal_type);
        if (clash) continue;
        const eventId = uid('e');
        newEvents.push({
          id: eventId,
          family_id: family.id,
          title: recipe ? `${recipe.icon || '🍽️'} ${recipe.title}` : '🍽️ Meal',
          description: null,
          start_at: `${dateStr}T${startTime}:00`,
          end_at: `${dateStr}T${endTime}:00`,
          all_day: false,
          location: null,
          category: 'meal',
          member_ids: [],
          recurrence: null,
          reminder_offsets: [],
          created_by: activeMember?.id ?? null,
          created_at: new Date().toISOString(),
        });
        newPlans.push({
          id: uid('mp'),
          family_id: family.id,
          recipe_id: source.recipe_id,
          date: dateStr,
          meal_type: source.meal_type,
          servings: source.servings,
          calendar_event_id: eventId,
          notes: null,
          created_by: activeMember?.id ?? null,
          created_at: new Date().toISOString(),
        });
      }
      if (newPlans.length === 0) return;
      setEvents((prev) => [...prev, ...newEvents]);
      setMealPlans((prev) => [...prev, ...newPlans]);
      // Events first — the meal_plans rows reference them via FK.
      void Promise.all(newEvents.map((e) => dbUpsert('events', e))).then(() =>
        newPlans.forEach((p) => dbUpsert('meal_plans', p)),
      );
      newEvents.forEach((e) => syncEventToGoogle(e.id));
    },
    [mealPlans, recipes, family.id, activeMember],
  );

  const updateKitchenSettings = useCallback(
    (patch: Partial<KitchenSettings>) => setKitchenSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  // ---- Virtual Pet ---------------------------------------------------------

  const getPet = useCallback(
    (memberId: string): VirtualPet | null => pets.find((p) => p.member_id === memberId) ?? null,
    [pets],
  );

  const createPet = useCallback(
    (
      memberId: string,
      animal: PetAnimal,
      name: string,
      custom?: { image: string; eyes: CustomPetEyes } | null,
    ) => {
      const member = members.find((m) => m.id === memberId);
      if (!member) return;
      const memberCompletions = completions.filter(
        (c) => c.member_id === memberId && c.status === 'approved',
      ).length;
      const memberCheckIns = checkIns.filter((c) => c.member_id === memberId).length;
      const xp = memberCompletions * 10 + memberCheckIns * 5;
      const unlocked_actions = deriveUnlockedActions(xp);
      const newPet: VirtualPet = {
        id: uid('pet'),
        family_id: member.family_id,
        member_id: memberId,
        animal,
        name,
        hunger: 80,
        thirst: 80,
        happiness: 80,
        xp,
        unlocked_actions,
        last_fed_at: null,
        last_watered_at: null,
        last_interacted_at: null,
        created_at: new Date().toISOString(),
        accessories: [],
        custom_image_data: custom?.image ?? null,
        custom_eyes: custom?.eyes ?? null,
      };
      setPets((prev) => [...prev.filter((p) => p.member_id !== memberId), newPet]);
      persistPet(newPet);
    },
    [members, completions, checkIns],
  );

  const setPetCustomDrawing = useCallback(
    (memberId: string, image: string, eyes: CustomPetEyes) => {
      setPets((prev) =>
        prev.map((p) => {
          if (p.member_id !== memberId) return p;
          const updated = { ...p, custom_image_data: image, custom_eyes: eyes };
          persistPet(updated);
          return updated;
        }),
      );
    },
    [],
  );

  const feedPet = useCallback((memberId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const updated = { ...p, hunger: 100, last_fed_at: new Date().toISOString() };
        persistPet(updated);
        return updated;
      }),
    );
  }, []);

  const waterPet = useCallback((memberId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const updated = { ...p, thirst: 100, last_watered_at: new Date().toISOString() };
        persistPet(updated);
        return updated;
      }),
    );
  }, []);

  const patPet = useCallback((memberId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const current = computePetStats(p);
        const updated = {
          ...p,
          happiness: Math.min(100, current.happiness + 20),
          last_interacted_at: new Date().toISOString(),
        };
        persistPet(updated);
        return updated;
      }),
    );
  }, []);

  const playWithPet = useCallback((memberId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const current = computePetStats(p);
        const updated = {
          ...p,
          happiness: Math.min(100, current.happiness + 35),
          last_interacted_at: new Date().toISOString(),
        };
        persistPet(updated);
        return updated;
      }),
    );
  }, []);

  const wearAccessory = useCallback((memberId: string, accessoryId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const current = Array.isArray(p.accessories) ? p.accessories : [];
        if (current.includes(accessoryId)) return p;
        const updated = { ...p, accessories: [...current, accessoryId] };
        persistPet(updated);
        return updated;
      }),
    );
  }, []);

  const removeAccessory = useCallback((memberId: string, accessoryId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const current = Array.isArray(p.accessories) ? p.accessories : [];
        const updated = { ...p, accessories: current.filter((a) => a !== accessoryId) };
        persistPet(updated);
        return updated;
      }),
    );
  }, []);

  const gainXp = useCallback((memberId: string, amount: number) => {
    if (amount <= 0) return;
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const newXp = Math.max(0, p.xp + amount);
        const updated = {
          ...p,
          xp: newXp,
          unlocked_actions: deriveUnlockedActions(newXp),
        };
        persistPet(updated);
        return updated;
      }),
    );
  }, []);

  const clearNeedsPasswordSetup = useCallback(() => {
    sessionStorage.removeItem('needs_password_setup');
    setNeedsPasswordSetup(false);
  }, []);

  // Sort members for display by the stored member order. Members not in the
  // stored order keep their natural array position at the end.
  const sortedMembers = useMemo(() => {
    if (memberOrder.length === 0) return members;
    const indexOf = (id: string) => {
      const i = memberOrder.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...members].sort((a, b) => indexOf(a.id) - indexOf(b.id));
  }, [members, memberOrder]);

  // Same shape for habits, chores, lists — sort by stored order with new
  // entries falling to the end.
  const sortByOrder = <T extends { id: string }>(items: T[], order: string[]): T[] => {
    if (order.length === 0) return items;
    const indexOf = (id: string) => {
      const i = order.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...items].sort((a, b) => indexOf(a.id) - indexOf(b.id));
  };
  const sortedHabits = useMemo(() => sortByOrder(habits, habitOrder), [habits, habitOrder]);
  const sortedChores = useMemo(() => sortByOrder(chores, choreOrder), [chores, choreOrder]);
  const sortedLists = useMemo(() => sortByOrder(lists, listOrder), [lists, listOrder]);

  // Memoize the context value so consumers only re-render when an actual
  // data slice or callback changes — not on every state update elsewhere
  // in this provider. The dep list must include every property we emit.
  const value = useMemo<FamilyContextValue>(
    () => ({
      family,
      members: sortedMembers,
      events,
      chores: sortedChores,
      completions,
      redemptions,
      goals,
      rewardCategories: DEFAULT_REWARD_CATEGORIES,
      lists: sortedLists,
      listItems,
      habits: sortedHabits,
      checkIns,
      activeMember,
      isDemoMode: !isSupabaseConfigured,
      signInAs,
      signOut,
      addEvent,
      addMember,
      updateEvent,
      deleteEvent,
      updateMember,
      deleteMember,
      moveMember,
      reorderMembers,
      reorderHabits,
      reorderChores,
      reorderLists,
      reorderListItems,
      setMemberPin,
      setMemberLocation,
      addChore,
      updateChore,
      deleteChore,
      completeChore,
      deleteCompletion,
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
      incrementCheckIn,
      decrementCheckIn,
      dayPlanBlocks,
      activityPool,
      addDayPlanBlock,
      updateDayPlanBlock,
      removeDayPlanBlock,
      reorderDayPlanBlocks,
      toggleBlockDone,
      addPoolItem,
      updatePoolItem,
      archivePoolItem,
      recipes,
      mealPlans,
      kitchenSettings,
      addRecipe,
      updateRecipe,
      deleteRecipe,
      toggleRecipeFavorite,
      addMealPlan,
      removeMealPlan,
      moveMealPlan,
      updateMealPlan,
      repeatMealPlan,
      updateKitchenSettings,
      pets,
      getPet,
      createPet,
      setPetCustomDrawing,
      feedPet,
      waterPet,
      patPet,
      playWithPet,
      wearAccessory,
      removeAccessory,
      gainXp,
      needsPasswordSetup,
      clearNeedsPasswordSetup,
      reloadFromCloud,
      reloading,
      lastReloadAt,
      online,
    }),
    [
      family,
      sortedMembers,
      events,
      sortedChores,
      completions,
      redemptions,
      goals,
      sortedLists,
      listItems,
      sortedHabits,
      checkIns,
      activeMember,
      signInAs,
      signOut,
      addEvent,
      addMember,
      updateEvent,
      deleteEvent,
      updateMember,
      deleteMember,
      moveMember,
      reorderMembers,
      reorderHabits,
      reorderChores,
      reorderLists,
      reorderListItems,
      setMemberPin,
      setMemberLocation,
      addChore,
      updateChore,
      deleteChore,
      completeChore,
      deleteCompletion,
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
      incrementCheckIn,
      decrementCheckIn,
      dayPlanBlocks,
      activityPool,
      addDayPlanBlock,
      updateDayPlanBlock,
      removeDayPlanBlock,
      reorderDayPlanBlocks,
      toggleBlockDone,
      addPoolItem,
      updatePoolItem,
      archivePoolItem,
      recipes,
      mealPlans,
      kitchenSettings,
      addRecipe,
      updateRecipe,
      deleteRecipe,
      toggleRecipeFavorite,
      addMealPlan,
      removeMealPlan,
      moveMealPlan,
      updateMealPlan,
      repeatMealPlan,
      updateKitchenSettings,
      pets,
      getPet,
      createPet,
      setPetCustomDrawing,
      feedPet,
      waterPet,
      patPet,
      playWithPet,
      wearAccessory,
      removeAccessory,
      gainXp,
      needsPasswordSetup,
      clearNeedsPasswordSetup,
      reloadFromCloud,
      reloading,
      lastReloadAt,
      online,
    ],
  );

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider');
  return ctx;
}
