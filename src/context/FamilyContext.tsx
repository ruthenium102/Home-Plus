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
import { dbUpsert, dbDelete, dbLoadFamily, dbCreateFamily } from '@/lib/db';
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
  VirtualPet
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
  addMember: (m: Omit<FamilyMember, 'id' | 'created_at' | 'family_id'>) => void;
  updateMember: (id: string, patch: Partial<FamilyMember>) => void;
  deleteMember: (id: string) => void;
  /** Move a member one step up or down in the display order. */
  moveMember: (id: string, direction: 'up' | 'down') => void;
  setMemberPin: (id: string, pin: string | null) => void;
  setMemberLocation: (id: string, location: string | null, until: string | null) => void;

  // Chores
  addChore: (c: Omit<Chore, 'id' | 'created_at' | 'family_id'>) => void;
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
  incrementCheckIn: (habitId: string, memberId: string, forDate: string) => void;
  decrementCheckIn: (habitId: string, memberId: string, forDate: string) => void;

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
  setPetCustomDrawing: (
    memberId: string,
    image: string,
    eyes: CustomPetEyes,
  ) => void;
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
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

const SESSION_KEY = 'session';
const FAMILY_KEY = 'demo:family';
const EVENTS_KEY = 'demo:events';
const MEMBERS_KEY = 'demo:members';
const MEMBER_ORDER_KEY = 'demo:member_order';
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
  // Ordered list of member ids — pure UI ordering, kept in localStorage only.
  // Members missing from this list fall back to their natural array order.
  const [memberOrder, setMemberOrder] = useState<string[]>(() =>
    storage.get<string[]>(MEMBER_ORDER_KEY, [])
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
  const [recipes, setRecipes] = useState<Recipe[]>(() =>
    storage.get<Recipe[]>(RECIPES_KEY, [])
  );
  const [mealPlans, setMealPlans] = useState<MealPlan[]>(() =>
    storage.get<MealPlan[]>(MEAL_PLANS_KEY, [])
  );
  const [kitchenSettings, setKitchenSettings] = useState<KitchenSettings>(() =>
    storage.get<KitchenSettings>(KITCHEN_SETTINGS_KEY, DEFAULT_KITCHEN_SETTINGS)
  );
  const [pets, setPets] = useState<VirtualPet[]>(() =>
    storage.get<VirtualPet[]>(PETS_KEY, [])
  );
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(
    () => sessionStorage.getItem('needs_password_setup') === '1'
  );

  // On auth, load data from Supabase. On first login, create the initial family.
  const handled = useRef(false);
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
              setMembers((prev) => prev.map((m) => (m.id === mine.id ? { ...m, email: userEmail } : m)));
            }
          }
          return;
        }
      }

      // 3. Check for a pending invite token (user arrived via email invite link).
      //    Call the accept_invitation() function which links them to the family,
      //    then re-fetch the family_member row that was just created.
      const pendingInvite = sessionStorage.getItem('pending_invite');
      if (pendingInvite) {
        sessionStorage.removeItem('pending_invite');
        try {
          await supabase!.rpc('accept_invitation', { p_token: pendingInvite });
        } catch (e) {
          console.warn('[handleAuth] accept_invitation error:', e);
        }
        // Re-query for the member row that accept_invitation just created/updated
        const { data: newMemberRow } = await supabase!
          .from('family_members')
          .select('family_id')
          .eq('auth_user_id', userId)
          .maybeSingle();
        if (newMemberRow?.family_id) {
          const data = await dbLoadFamily(newMemberRow.family_id as string);
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
            const mine = data.members.find((m) => m.auth_user_id === userId);
            if (mine) {
              const sess: ActiveSession = { member_id: mine.id, authenticated_at: Date.now() };
              storage.set(SESSION_KEY, sess);
              setSession(sess);
              // Save email to the member row if not already set
              if (userEmail && !mine.email) {
                await supabase!.from('family_members').update({ email: userEmail }).eq('id', mine.id);
              }
              // Flag that this user should be prompted to set a password
              sessionStorage.setItem('needs_password_setup', '1');
              setNeedsPasswordSetup(true);
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
            auth_user_id: isOwner ? userId : m.auth_user_id ?? null,
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

      const newFamily: Family = { id: familyId, name: familyName, timezone: tz, created_at: now };
      const newMember: FamilyMember = {
        id: memberId, family_id: familyId, name,
        role: 'parent', color: 'terracotta',
        avatar_url: null, pin_hash: null, birthday: null,
        current_location: null, location_until: null,
        reward_balances: {}, my_day_enabled: false,
        chores_enabled: true, habits_enabled: true, kitchen_enabled: false, pet_enabled: false, email: userEmail,
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
      handleAuth(u?.id ?? null, u?.user_metadata ?? null, u?.email ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Reset handled flag on sign-out so next sign-in re-runs
      if (!sess) { handled.current = false; return; }
      const u = sess.user;
      handleAuth(u?.id ?? null, u?.user_metadata ?? null, u?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Realtime subscriptions — keep all devices in sync
  useEffect(() => {
    if (!LIVE || !supabase || !family.id || family.id === DEMO_FAMILY.id) return;
    const fid = family.id;

    const upsertById = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>, item: T) =>
      setter((prev) => prev.some((x) => x.id === item.id) ? prev.map((x) => x.id === item.id ? item : x) : [...prev, item]);
    const removeById = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>, id: string) =>
      setter((prev) => prev.filter((x) => x.id !== id));

    const channel = supabase.channel(`hp-${fid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setMembers, (o as FamilyMember).id);
          else upsertById(setMembers, n as FamilyMember);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setEvents, (o as CalendarEvent).id);
          else upsertById(setEvents, n as CalendarEvent);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chores', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setChores, (o as Chore).id);
          else upsertById(setChores, n as Chore);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chore_completions', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setCompletions, (o as ChoreCompletion).id);
          else upsertById(setCompletions, n as ChoreCompletion);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_lists', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setLists, (o as TodoList).id);
          else upsertById(setLists, n as TodoList);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setListItems, (o as TodoItem).id);
          else upsertById(setListItems, n as TodoItem);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setHabits, (o as Habit).id);
          else upsertById(setHabits, n as Habit);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_check_ins', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setCheckIns, (o as HabitCheckIn).id);
          else upsertById(setCheckIns, n as HabitCheckIn);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reward_goals', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setGoals, (o as RewardGoal).id);
          else upsertById(setGoals, n as RewardGoal);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'redemptions', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setRedemptions, (o as Redemption).id);
          else upsertById(setRedemptions, n as Redemption);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_plan_blocks', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setDayPlanBlocks, (o as DayPlanBlock).id);
          else upsertById(setDayPlanBlocks, n as DayPlanBlock);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_pool_items', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setActivityPool, (o as ActivityPoolItem).id);
          else upsertById(setActivityPool, n as ActivityPoolItem);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setRecipes, (o as Recipe).id);
          else upsertById(setRecipes, n as Recipe);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plans', filter: `family_id=eq.${fid}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'DELETE') removeById(setMealPlans, (o as MealPlan).id);
          else upsertById(setMealPlans, n as MealPlan);
        })
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [family.id]);

  // Persist
  useEffect(() => storage.set(FAMILY_KEY, family), [family]);
  useEffect(() => storage.set(MEMBERS_KEY, members), [members]);
  useEffect(() => storage.set(MEMBER_ORDER_KEY, memberOrder), [memberOrder]);
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
  useEffect(() => storage.set(RECIPES_KEY, recipes), [recipes]);
  useEffect(() => storage.set(MEAL_PLANS_KEY, mealPlans), [mealPlans]);
  useEffect(() => storage.set(KITCHEN_SETTINGS_KEY, kitchenSettings), [kitchenSettings]);
  useEffect(() => storage.set(PETS_KEY, pets), [pets]);
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

  // ---- Virtual Pet helpers -------------------------------------------------

  function computePetStats(pet: VirtualPet): { hunger: number; thirst: number; happiness: number } {
    const now = Date.now();
    const hoursSince = (ts: string | null) => ts ? (now - new Date(ts).getTime()) / 3600000 : null;

    const hungerElapsed = hoursSince(pet.last_fed_at);
    const hunger = hungerElapsed !== null
      ? Math.max(0, Math.min(100, pet.hunger - hungerElapsed * 8))
      : pet.hunger;

    const thirstElapsed = hoursSince(pet.last_watered_at);
    const thirst = thirstElapsed !== null
      ? Math.max(0, Math.min(100, pet.thirst - thirstElapsed * 12))
      : pet.thirst;

    const happinessElapsed = hoursSince(pet.last_interacted_at);
    const happiness = happinessElapsed !== null
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
          (c) => c.member_id === pet.member_id && c.status === 'approved'
        ).length;
        const memberCheckIns = checkIns.filter((c) => c.member_id === pet.member_id).length;
        const baselineXp = memberCompletions * 10 + memberCheckIns * 5;
        // Pet keeps the max of (baseline derived from chores/habits) and (current xp,
        // which may include mini-game bonuses).
        const newXp = Math.max(pet.xp, baselineXp);
        if (newXp === pet.xp) return pet;
        const unlocked_actions = deriveUnlockedActions(newXp);
        return { ...pet, xp: newXp, unlocked_actions };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completions, checkIns]);

  // Backfill `accessories` on pets created before the field existed.
  useEffect(() => {
    if (pets.length === 0) return;
    if (pets.every((p) => Array.isArray(p.accessories))) return;
    setPets((prev) =>
      prev.map((p) => (Array.isArray(p.accessories) ? p : { ...p, accessories: [] }))
    );
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
    (e: Omit<CalendarEvent, 'id' | 'created_at' | 'family_id'>) => {
      const newEvent: CalendarEvent = { ...e, id: uid('e'), created_at: new Date().toISOString(), family_id: family.id };
      setEvents((prev) => [...prev, newEvent]);
      dbUpsert('events', newEvent as unknown as Record<string, unknown>);
    },
    [family.id]
  );

  const updateEvent = useCallback(
    (id: string, patch: Partial<CalendarEvent>) =>
      setEvents((prev) => prev.map((e) => {
        if (e.id !== id) return e;
        const updated = { ...e, ...patch };
        dbUpsert('events', updated as unknown as Record<string, unknown>);
        // If this is a meal event whose date changed, sync the linked meal
        // plan's date so the planner stays in lockstep with the calendar.
        if (updated.category === 'meal' && patch.start_at && patch.start_at !== e.start_at) {
          const newDate = updated.start_at.slice(0, 10);
          setMealPlans((mps) =>
            mps.map((mp) => {
              if (mp.calendar_event_id !== id || mp.date === newDate) return mp;
              const next = { ...mp, date: newDate };
              dbUpsert('meal_plans', next as unknown as Record<string, unknown>);
              return next;
            }),
          );
        }
        return updated;
      })),
    []
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
      setEvents((prev) => prev.filter((e) => e.id !== id));
      dbDelete('events', id);
    },
    []
  );

  // ---- Members -------------------------------------------------------------

  const addMember = useCallback(
    (m: Omit<FamilyMember, 'id' | 'created_at' | 'family_id'>) => {
      const newMember: FamilyMember = { ...m, id: uid('m'), family_id: family.id, created_at: new Date().toISOString() };
      setMembers((prev) => [...prev, newMember]);
      dbUpsert('family_members', newMember as unknown as Record<string, unknown>);
    },
    [family.id]
  );

  const updateMember = useCallback(
    (id: string, patch: Partial<FamilyMember>) =>
      setMembers((prev) => prev.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, ...patch };
        dbUpsert('family_members', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
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

  const setMemberPin = useCallback((id: string, pin: string | null) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, pin_hash: pin ? hashPinSync(pin) : null };
        dbUpsert('family_members', updated as unknown as Record<string, unknown>);
        return updated;
      })
    );
  }, []);

  const setMemberLocation = useCallback(
    (id: string, location: string | null, until: string | null) => {
      setMembers((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const updated = { ...m, current_location: location, location_until: until };
          dbUpsert('family_members', updated as unknown as Record<string, unknown>);
          return updated;
        })
      );
    },
    []
  );

  // ---- Chores --------------------------------------------------------------

  const addChore = useCallback(
    (c: Omit<Chore, 'id' | 'created_at' | 'family_id'>) => {
      const newChore: Chore = { ...c, id: uid('c'), created_at: new Date().toISOString(), family_id: family.id };
      setChores((prev) => [...prev, newChore]);
      dbUpsert('chores', newChore as unknown as Record<string, unknown>);
    },
    [family.id]
  );

  const updateChore = useCallback(
    (id: string, patch: Partial<Chore>) =>
      setChores((prev) => prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...patch };
        dbUpsert('chores', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
  );

  const deleteChore = useCallback(
    (id: string) => {
      setChores((prev) => prev.filter((c) => c.id !== id));
      dbDelete('chores', id);
    },
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
      dbUpsert('chore_completions', completion as unknown as Record<string, unknown>);

      if (status === 'approved') {
        setMembers((prev) => applyPayout(prev, memberId, chore.payout, 1));
      }

      return completion;
    },
    [chores, family.id]
  );

  const deleteCompletion = useCallback((completionId: string) => {
    setCompletions((prev) => {
      const target = prev.find((c) => c.id === completionId);
      if (!target) return prev;
      if (target.status === 'approved') {
        setMembers((m) => applyPayout(m, target.member_id, target.payout, -1));
      }
      dbDelete('chore_completions', completionId);
      return prev.filter((c) => c.id !== completionId);
    });
  }, []);

  const approveCompletion = useCallback((completionId: string, approverId: string) => {
    setCompletions((prev) => {
      const target = prev.find((c) => c.id === completionId);
      if (!target || target.status !== 'pending_approval') return prev;
      setMembers((m) => applyPayout(m, target.member_id, target.payout, 1));
      return prev.map((c) => {
        if (c.id !== completionId) return c;
        const updated = { ...c, status: 'approved' as const, approved_by: approverId, approved_at: new Date().toISOString() };
        dbUpsert('chore_completions', updated as unknown as Record<string, unknown>);
        return updated;
      });
    });
  }, []);

  const rejectCompletion = useCallback((completionId: string, approverId: string) =>
    setCompletions((prev) =>
      prev.map((c) => {
        if (c.id !== completionId) return c;
        const updated = { ...c, status: 'rejected' as const, approved_by: approverId, approved_at: new Date().toISOString() };
        dbUpsert('chore_completions', updated as unknown as Record<string, unknown>);
        return updated;
      })
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
      dbUpsert('redemptions', redemption as unknown as Record<string, unknown>);

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
      setMembers((m) => applyPayout(m, r.member_id, { [r.category]: r.amount } as any, -1));
      return prev.map((x) => {
        if (x.id !== id) return x;
        const updated = { ...x, status: 'approved' as const, approved_by: approverId, approved_at: new Date().toISOString() };
        dbUpsert('redemptions', updated as unknown as Record<string, unknown>);
        return updated;
      });
    });
  }, []);

  const rejectRedemption = useCallback((id: string, approverId: string) =>
    setRedemptions((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        const updated = { ...x, status: 'rejected' as const, approved_by: approverId, approved_at: new Date().toISOString() };
        dbUpsert('redemptions', updated as unknown as Record<string, unknown>);
        return updated;
      })
    ), []);

  // ---- Goals ---------------------------------------------------------------

  const addGoal = useCallback(
    (g: Omit<RewardGoal, 'id' | 'created_at' | 'family_id' | 'achieved_at'>) => {
      const newGoal: RewardGoal = { ...g, id: uid('g'), created_at: new Date().toISOString(), family_id: family.id, achieved_at: null };
      setGoals((prev) => [...prev, newGoal]);
      dbUpsert('reward_goals', newGoal as unknown as Record<string, unknown>);
    },
    [family.id]
  );

  const deleteGoal = useCallback(
    (id: string) => {
      setGoals((prev) => prev.filter((g) => g.id !== id));
      dbDelete('reward_goals', id);
    },
    []
  );

  // ---- Lists ---------------------------------------------------------------

  const addList = useCallback(
    (l: Omit<TodoList, 'id' | 'created_at' | 'family_id'>): string => {
      const id = uid('l');
      const newList: TodoList = { ...l, id, created_at: new Date().toISOString(), family_id: family.id };
      setLists((prev) => [...prev, newList]);
      dbUpsert('todo_lists', newList as unknown as Record<string, unknown>);
      return id;
    },
    [family.id]
  );

  const updateList = useCallback(
    (id: string, patch: Partial<TodoList>) =>
      setLists((prev) => prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch };
        dbUpsert('todo_lists', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
  );

  const deleteList = useCallback((id: string) => {
    setLists((prev) => prev.filter((l) => l.id !== id));
    setListItems((prev) => prev.filter((i) => i.list_id !== id));
    dbDelete('todo_lists', id);
  }, []);

  const addListItem = useCallback(
    (item: Omit<TodoItem, 'id' | 'created_at' | 'family_id'>) => {
      const newItem: TodoItem = { ...item, id: uid('li'), created_at: new Date().toISOString(), family_id: family.id };
      setListItems((prev) => [...prev, newItem]);
      dbUpsert('todo_items', newItem as unknown as Record<string, unknown>);
    },
    [family.id]
  );

  const updateListItem = useCallback(
    (id: string, patch: Partial<TodoItem>) =>
      setListItems((prev) => prev.map((i) => {
        if (i.id !== id) return i;
        const updated = { ...i, ...patch };
        dbUpsert('todo_items', updated as unknown as Record<string, unknown>);
        return updated;
      })),
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
    (id: string) => {
      setListItems((prev) => prev.filter((i) => i.id !== id));
      dbDelete('todo_items', id);
    },
    []
  );

  // ---- Habits --------------------------------------------------------------

  const addHabit = useCallback(
    (h: Omit<Habit, 'id' | 'created_at' | 'family_id'>) => {
      const newHabit: Habit = {
        ...h,
        count_mode: h.count_mode ?? false,
        daily_target: h.daily_target ?? 1,
        id: uid('h'),
        created_at: new Date().toISOString(),
        family_id: family.id
      };
      setHabits((prev) => [...prev, newHabit]);
      dbUpsert('habits', newHabit as unknown as Record<string, unknown>);
    },
    [family.id]
  );

  const updateHabit = useCallback(
    (id: string, patch: Partial<Habit>) =>
      setHabits((prev) => prev.map((h) => {
        if (h.id !== id) return h;
        const updated = { ...h, ...patch };
        dbUpsert('habits', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
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

      const existing = checkIns.find(
        (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === forDate
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
        created_at: new Date().toISOString()
      };

      const nextCheckIns = [...checkIns, newCheckIn];
      setCheckIns(nextCheckIns);
      dbUpsert('habit_check_ins', newCheckIn as unknown as Record<string, unknown>);

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

  const incrementCheckIn = useCallback(
    (habitId: string, memberId: string, forDate: string) => {
      setCheckIns((prev) => {
        const existing = prev.find(
          (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === forDate
        );
        if (existing) {
          const updated = { ...existing, count: (existing.count ?? 1) + 1 };
          dbUpsert('habit_check_ins', updated as unknown as Record<string, unknown>);
          return prev.map((c) => (c.id === existing.id ? updated : c));
        }
        const newCheckIn: HabitCheckIn = {
          id: uid('hc'),
          habit_id: habitId,
          family_id: family.id,
          member_id: memberId,
          for_date: forDate,
          count: 1,
          created_at: new Date().toISOString()
        };
        dbUpsert('habit_check_ins', newCheckIn as unknown as Record<string, unknown>);
        return [...prev, newCheckIn];
      });
    },
    [family.id]
  );

  const decrementCheckIn = useCallback(
    (habitId: string, memberId: string, forDate: string) => {
      setCheckIns((prev) => {
        const existing = prev.find(
          (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === forDate
        );
        if (!existing) return prev;
        const currentCount = existing.count ?? 1;
        if (currentCount <= 1) {
          dbDelete('habit_check_ins', existing.id);
          return prev.filter((c) => c.id !== existing.id);
        }
        const updated = { ...existing, count: currentCount - 1 };
        dbUpsert('habit_check_ins', updated as unknown as Record<string, unknown>);
        return prev.map((c) => (c.id === existing.id ? updated : c));
      });
    },
    []
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
      dbUpsert('day_plan_blocks', newBlock as unknown as Record<string, unknown>);
      if (block.source === 'other') {
        setActivityPool((prev) =>
          prev.map((p) => {
            if (p.id !== block.source_id) return p;
            const updated = { ...p, usage_count: p.usage_count + 1 };
            dbUpsert('activity_pool_items', updated as unknown as Record<string, unknown>);
            return updated;
          })
        );
      }
      return newBlock;
    },
    [family.id]
  );

  const updateDayPlanBlock = useCallback(
    (id: string, patch: Partial<DayPlanBlock>) =>
      setDayPlanBlocks((prev) => prev.map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, ...patch };
        dbUpsert('day_plan_blocks', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
  );

  const removeDayPlanBlock = useCallback(
    (id: string) => {
      setDayPlanBlocks((prev) => prev.filter((b) => b.id !== id));
      dbDelete('day_plan_blocks', id);
    },
    []
  );

  const reorderDayPlanBlocks = useCallback(
    (updates: { id: string; position: number; section: DayPlanSection }[]) =>
      setDayPlanBlocks((prev) =>
        prev.map((b) => {
          const u = updates.find((x) => x.id === b.id);
          if (!u) return b;
          const updated = { ...b, position: u.position, section: u.section };
          dbUpsert('day_plan_blocks', updated as unknown as Record<string, unknown>);
          return updated;
        })
      ),
    []
  );

  const toggleBlockDone = useCallback(
    (id: string) =>
      setDayPlanBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const updated = { ...b, done: !b.done, done_at: !b.done ? new Date().toISOString() : null };
          dbUpsert('day_plan_blocks', updated as unknown as Record<string, unknown>);
          return updated;
        })
      ),
    []
  );

  const addPoolItem = useCallback(
    (item: Omit<ActivityPoolItem, 'id' | 'created_at' | 'family_id'>) => {
      const newItem: ActivityPoolItem = { ...item, id: uid('ap'), created_at: new Date().toISOString(), family_id: family.id };
      setActivityPool((prev) => [...prev, newItem]);
      dbUpsert('activity_pool_items', newItem as unknown as Record<string, unknown>);
    },
    [family.id]
  );

  const updatePoolItem = useCallback(
    (id: string, patch: Partial<ActivityPoolItem>) =>
      setActivityPool((prev) => prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, ...patch };
        dbUpsert('activity_pool_items', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
  );

  const archivePoolItem = useCallback(
    (id: string) =>
      setActivityPool((prev) => prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, archived: true };
        dbUpsert('activity_pool_items', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
  );

  // ---- Kitchen ---------------------------------------------------------------

  const addRecipe = useCallback(
    (r: Omit<Recipe, 'id' | 'created_at' | 'family_id'>) => {
      const newRecipe: Recipe = { ...r, id: uid('r'), created_at: new Date().toISOString(), family_id: family.id };
      setRecipes((prev) => [...prev, newRecipe]);
      dbUpsert('recipes', newRecipe as unknown as Record<string, unknown>);
    },
    [family.id]
  );

  const updateRecipe = useCallback(
    (id: string, patch: Partial<Recipe>) =>
      setRecipes((prev) => prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        dbUpsert('recipes', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
  );

  const deleteRecipe = useCallback(
    (id: string) => {
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      // Also remove any meal plans referencing this recipe
      setMealPlans((prev) => {
        const toRemove = prev.filter((m) => m.recipe_id === id);
        toRemove.forEach((m) => {
          dbDelete('meal_plans', m.id);
          if (m.calendar_event_id) {
            setEvents((ev) => ev.filter((e) => e.id !== m.calendar_event_id));
            dbDelete('events', m.calendar_event_id);
          }
        });
        return prev.filter((m) => m.recipe_id !== id);
      });
      dbDelete('recipes', id);
    },
    []
  );

  const toggleRecipeFavorite = useCallback(
    (id: string) =>
      setRecipes((prev) => prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, favorite: !r.favorite };
        dbUpsert('recipes', updated as unknown as Record<string, unknown>);
        return updated;
      })),
    []
  );

  const addMealPlan = useCallback(
    (mp: Omit<MealPlan, 'id' | 'created_at' | 'family_id'>) => {
      const recipe = recipes.find((r) => r.id === mp.recipe_id);
      const eventId = uid('e');
      const times = { breakfast: ['08:00', '09:00'], lunch: ['12:30', '13:30'], dinner: ['18:30', '20:00'], snack: ['15:00', '15:30'] };
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
      dbUpsert('events', newEvent as unknown as Record<string, unknown>);
      dbUpsert('meal_plans', newMealPlan as unknown as Record<string, unknown>);
    },
    [family.id, recipes, activeMember]
  );

  const removeMealPlan = useCallback(
    (id: string) => {
      setMealPlans((prev) => {
        const target = prev.find((m) => m.id === id);
        if (target?.calendar_event_id) {
          setEvents((ev) => ev.filter((e) => e.id !== target.calendar_event_id));
          dbDelete('events', target.calendar_event_id);
        }
        dbDelete('meal_plans', id);
        return prev.filter((m) => m.id !== id);
      });
    },
    []
  );

  const repeatMealPlan = useCallback(
    (sourceMealPlanId: string, weekdays: number[], weeks: number) => {
      const source = mealPlans.find((m) => m.id === sourceMealPlanId);
      if (!source || weekdays.length === 0 || weeks <= 0) return;
      const recipe = recipes.find((r) => r.id === source.recipe_id);
      const times = { breakfast: ['08:00', '09:00'], lunch: ['12:30', '13:30'], dinner: ['18:30', '20:00'], snack: ['15:00', '15:30'] };
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
        const clash = mealPlans.some(
          (m) => m.date === dateStr && m.meal_type === source.meal_type && m.recipe_id === source.recipe_id,
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
      newEvents.forEach((e) => dbUpsert('events', e as unknown as Record<string, unknown>));
      newPlans.forEach((p) => dbUpsert('meal_plans', p as unknown as Record<string, unknown>));
    },
    [mealPlans, recipes, family.id, activeMember],
  );

  const updateKitchenSettings = useCallback(
    (patch: Partial<KitchenSettings>) =>
      setKitchenSettings((prev) => ({ ...prev, ...patch })),
    []
  );

  // ---- Virtual Pet ---------------------------------------------------------

  const getPet = useCallback(
    (memberId: string): VirtualPet | null =>
      pets.find((p) => p.member_id === memberId) ?? null,
    [pets]
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
        (c) => c.member_id === memberId && c.status === 'approved'
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
    },
    [members, completions, checkIns]
  );

  const setPetCustomDrawing = useCallback(
    (memberId: string, image: string, eyes: CustomPetEyes) => {
      setPets((prev) =>
        prev.map((p) =>
          p.member_id === memberId
            ? { ...p, custom_image_data: image, custom_eyes: eyes }
            : p,
        ),
      );
    },
    [],
  );

  const feedPet = useCallback((memberId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        return { ...p, hunger: 100, last_fed_at: new Date().toISOString() };
      })
    );
  }, []);

  const waterPet = useCallback((memberId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        return { ...p, thirst: 100, last_watered_at: new Date().toISOString() };
      })
    );
  }, []);

  const patPet = useCallback((memberId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const current = computePetStats(p);
        return {
          ...p,
          happiness: Math.min(100, current.happiness + 20),
          last_interacted_at: new Date().toISOString(),
        };
      })
    );
  }, []);

  const playWithPet = useCallback((memberId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const current = computePetStats(p);
        return {
          ...p,
          happiness: Math.min(100, current.happiness + 35),
          last_interacted_at: new Date().toISOString(),
        };
      })
    );
  }, []);

  const wearAccessory = useCallback((memberId: string, accessoryId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const current = Array.isArray(p.accessories) ? p.accessories : [];
        if (current.includes(accessoryId)) return p;
        return { ...p, accessories: [...current, accessoryId] };
      })
    );
  }, []);

  const removeAccessory = useCallback((memberId: string, accessoryId: string) => {
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const current = Array.isArray(p.accessories) ? p.accessories : [];
        return { ...p, accessories: current.filter((a) => a !== accessoryId) };
      })
    );
  }, []);

  const gainXp = useCallback((memberId: string, amount: number) => {
    if (amount <= 0) return;
    setPets((prev) =>
      prev.map((p) => {
        if (p.member_id !== memberId) return p;
        const newXp = Math.max(0, p.xp + amount);
        return {
          ...p,
          xp: newXp,
          unlocked_actions: deriveUnlockedActions(newXp),
        };
      })
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

  const value: FamilyContextValue = {
    family,
    members: sortedMembers,
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
    addMember,
    updateEvent,
    deleteEvent,
    updateMember,
    deleteMember,
    moveMember,
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
  };

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider');
  return ctx;
}
