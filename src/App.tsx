import { lazy, Suspense, useEffect, useRef, useState } from 'react';

// Capture invite token + password-recovery state from the URL immediately on
// module load — before React renders and before Supabase consumes the hash.
// Tokens can arrive in three places:
//   1. /accept-invite?token=...   — branded link from Resend / copy-link
//   2. ?invite=...                — legacy magic-link redirect param
//   3. #invite=... or #token=...  — Supabase sometimes pushes our params into
//                                   the hash when it adds its own access_token.
(() => {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const path = window.location.pathname;
  const fromPath = path.startsWith('/accept-invite') ? search.get('token') : null;
  const inviteToken =
    fromPath ||
    search.get('invite') ||
    search.get('token') ||
    hash.get('invite') ||
    hash.get('token');

  if (inviteToken) {
    sessionStorage.setItem('pending_invite', inviteToken);
  }

  // Detect Supabase password recovery flow:
  //   - ?reset=1 (set by our forgotPassword redirectTo)
  //   - #type=recovery from Supabase's auth redirect
  const isRecovery =
    search.get('reset') === '1' || hash.get('type') === 'recovery';
  if (isRecovery) {
    sessionStorage.setItem('password_recovery', '1');
  }

  // Strip our params from the URL so a refresh / back doesn't replay them.
  if (inviteToken || isRecovery || path.startsWith('/accept-invite')) {
    const cleanedSearch = new URLSearchParams(search);
    cleanedSearch.delete('invite');
    cleanedSearch.delete('token');
    cleanedSearch.delete('reset');
    const qs = cleanedSearch.toString();
    // Preserve any non-Supabase hash params we don't manage
    const cleanedHash = new URLSearchParams(hash);
    cleanedHash.delete('invite');
    cleanedHash.delete('token');
    const hs = cleanedHash.toString();
    const next = `/${qs ? '?' + qs : ''}${hs ? '#' + hs : ''}`;
    window.history.replaceState(null, '', next);
  }
})();
import { ThemeProvider } from '@/context/ThemeContext';
import { FamilyProvider, useFamily } from '@/context/FamilyContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { WeatherProvider } from '@/hooks/useWeather';
import { TopBar } from '@/components/TopBar';
import { TabBar, type TabKey } from '@/components/TabBar';
import { SideRail } from '@/components/SideRail';
import { UserSwitcher } from '@/components/UserSwitcher';
import { HomePage } from '@/pages/HomePage';
import { TabFallback } from '@/components/TabFallback';
import { SetPasswordModal } from '@/components/SetPasswordModal';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Lazy-load tab pages so the lock screen + home tab load fast.
// Each chunk is fetched on first visit to that tab.
const CalendarPage = lazy(() =>
  import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const ChoresPage = lazy(() =>
  import('@/pages/ChoresPage').then((m) => ({ default: m.ChoresPage })),
);
const ListsPage = lazy(() => import('@/pages/ListsPage').then((m) => ({ default: m.ListsPage })));
const HabitsPage = lazy(() =>
  import('@/pages/HabitsPage').then((m) => ({ default: m.HabitsPage })),
);
const KitchenPage = lazy(() =>
  import('@/pages/KitchenPage').then((m) => ({ default: m.KitchenPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const MyDayPage = lazy(() => import('@/pages/MyDayPage').then((m) => ({ default: m.MyDayPage })));
const PetPage = lazy(() => import('@/pages/PetPage').then((m) => ({ default: m.PetPage })));
const AuthPage = lazy(() => import('@/pages/AuthPage').then((m) => ({ default: m.AuthPage })));

function AppShell() {
  const { activeMember, needsPasswordSetup, clearNeedsPasswordSetup } = useFamily();
  const showMyDay = activeMember?.my_day_enabled ?? false;
  const showChores = activeMember?.chores_enabled ?? true;
  const showHabits = activeMember?.habits_enabled ?? true;
  const showKitchen = activeMember?.kitchen_enabled ?? false;
  const showPet = activeMember?.pet_enabled ?? false;
  const [tab, setTab] = useState<TabKey>('home');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => sessionStorage.getItem('password_recovery') === '1',
  );

  // Listen for Supabase's PASSWORD_RECOVERY auth event in case the user
  // followed the reset link directly into the app (and we missed the URL
  // params at module load).
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('password_recovery', '1');
        setPasswordRecovery(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Reset to home when switching members so hidden tabs aren't left active
  const prevMemberId = useRef(activeMember?.id);
  useEffect(() => {
    if (prevMemberId.current !== activeMember?.id) {
      prevMemberId.current = activeMember?.id;
      setTab('home');
    }
  }, [activeMember?.id]);

  // No active member → show fullscreen user switcher
  if (!activeMember) {
    return <UserSwitcher fullscreen />;
  }

  return (
    <div
      className="min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* iPad / desktop: left side rail (lg+). Hidden on phones. */}
      <SideRail
        active={tab}
        onChange={setTab}
        showMyDay={showMyDay}
        showChores={showChores}
        showHabits={showHabits}
        showPet={showPet}
        showKitchen={showKitchen}
      />

      <div
        className="max-w-6xl mx-auto p-4 sm:p-6 pb-36 lg:pb-8 lg:ml-56"
        style={{ paddingBottom: 'max(9rem, calc(7rem + env(safe-area-inset-bottom)))' }}
      >
        <TopBar onSwitchUser={() => setSwitcherOpen(true)} />

        <main>
          {tab === 'home' && <HomePage onNavigate={setTab} />}
          {tab !== 'home' && (
            <Suspense fallback={<TabFallback />}>
              {tab === 'calendar' && <CalendarPage />}
              {tab === 'chores' && <ChoresPage />}
              {tab === 'lists' && <ListsPage />}
              {tab === 'habits' && <HabitsPage />}
              {tab === 'kitchen' && <KitchenPage />}
              {tab === 'my-day' && <MyDayPage />}
              {tab === 'pet' && <PetPage />}
              {tab === 'settings' && <SettingsPage />}
            </Suspense>
          )}
        </main>
      </div>

      {/* Phone: sticky bottom tab bar. Hidden on iPad/desktop (lg+). */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-3 sm:px-6 lg:hidden"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-6xl mx-auto">
          <TabBar
            active={tab}
            onChange={setTab}
            showMyDay={showMyDay}
            showChores={showChores}
            showHabits={showHabits}
            showPet={showPet}
            showKitchen={showKitchen}
          />
        </div>
      </div>

      {switcherOpen && <UserSwitcher onClose={() => setSwitcherOpen(false)} />}

      {(needsPasswordSetup || passwordRecovery) && (
        <SetPasswordModal
          mode={passwordRecovery ? 'recovery' : 'invite'}
          onDone={() => {
            clearNeedsPasswordSetup();
            sessionStorage.removeItem('password_recovery');
            setPasswordRecovery(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Auth gate — only shown when Supabase is configured.
 * In demo mode (no env vars) this is bypassed entirely.
 */
function AuthGate() {
  const { session, loading } = useAuth();

  // Demo mode: skip auth, go straight to the app
  if (!isSupabaseConfigured) return <AppShell />;

  // Waiting for Supabase to resolve the session
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center">
        <div className="text-text-faint text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  // No session → show login / create-family page
  if (!session) {
    return (
      <Suspense fallback={null}>
        <AuthPage />
      </Suspense>
    );
  }

  // Authenticated → show the full app
  return <AppShell />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <FamilyProvider>
            <WeatherProvider>
              <AuthGate />
            </WeatherProvider>
          </FamilyProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
