import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

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
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TopBar } from '@/components/TopBar';
import { TabBar, type TabKey } from '@/components/TabBar';
import { SideRail } from '@/components/SideRail';
import { UserSwitcher } from '@/components/UserSwitcher';
import { HomePage } from '@/pages/HomePage';
import { TabFallback } from '@/components/TabFallback';
import { SetPasswordModal } from '@/components/SetPasswordModal';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useDockPlacement, useSideRailOpen } from '@/lib/dockPreference';
import { hapticLight, hideSplash } from '@/lib/native';

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
  const [dockPlacement] = useDockPlacement();
  const [railOpen, setRailOpen] = useSideRailOpen();
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

  // Navigation tap → light haptic + switch. Stable identity (useCallback, no
  // deps; setTab from useState is itself stable) so the memoized TabBar /
  // SideRail don't re-render just because AppShell re-rendered.
  const changeTab = useCallback((k: TabKey) => {
    void hapticLight();
    setTab(k);
    // Tabs share the window scroller, so without this a switch lands the new
    // tab wherever the old one was scrolled — native tab bars open at the top.
    window.scrollTo({ top: 0 });
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

  const dockIsSide = dockPlacement === 'side';

  return (
    <div
      className="min-h-dvh bg-bg"
      // Left/right insets keep content clear of the notch + rounded corners
      // in phone landscape; top keeps it below the status bar.
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Side rail — mounted whenever dock placement is 'side'; it slides in/
          out via a transform driven by `railOpen` so open/close stays smooth. */}
      {dockIsSide && (
        <SideRail
          active={tab}
          onChange={changeTab}
          onClose={() => setRailOpen(false)}
          open={railOpen}
          showMyDay={showMyDay}
          showChores={showChores}
          showHabits={showHabits}
          showPet={showPet}
          showKitchen={showKitchen}
        />
      )}

      <div
        className={
          'mx-auto p-3 sm:p-6 ' +
          // On a side rail (iPad landscape), let content use the full width
          // beside the rail instead of clamping to a centred phone column.
          // When the rail is collapsed the floating hamburger sits at top-left,
          // so keep a little left margin so the TopBar can't overlap it. The
          // margin transitions so content glides as the rail slides in/out.
          (dockIsSide
            ? 'pb-8 transition-[margin] duration-300 ease-out ' +
              (railOpen ? 'ml-56' : 'ml-14 sm:ml-16')
            : 'max-w-6xl pb-28 sm:pb-36')
        }
        style={
          dockIsSide
            ? undefined
            : { paddingBottom: 'max(6.5rem, calc(5.5rem + env(safe-area-inset-bottom)))' }
        }
      >
        {dockIsSide && (
          <button
            onClick={() => setRailOpen(true)}
            aria-hidden={railOpen}
            tabIndex={railOpen ? -1 : 0}
            className={
              'fixed top-3 left-3 z-40 w-10 h-10 rounded-md bg-surface border border-border flex items-center justify-center text-text-muted hover:bg-surface-2 shadow-sm transition-opacity duration-200 ' +
              (railOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 delay-150')
            }
            style={{
              top: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.75rem))',
              left: 'max(0.75rem, env(safe-area-inset-left))',
            }}
            title="Open navigation"
            aria-label="Open navigation"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="block w-4 h-0.5 bg-current rounded-full" />
              <span className="block w-4 h-0.5 bg-current rounded-full" />
              <span className="block w-4 h-0.5 bg-current rounded-full" />
            </span>
          </button>
        )}
        <TopBar onSwitchUser={() => setSwitcherOpen(true)} />

        <main>
          {tab === 'home' && <HomePage onNavigate={changeTab} />}
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

      {/* Floating bottom dock — shown when dock placement is 'floating'.
          safe-x-pad (not plain px-*): the dock is fixed to the viewport, so it
          needs its own notch-aware horizontal padding in phone landscape. */}
      {!dockIsSide && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 safe-x-pad"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-6xl mx-auto">
            <TabBar
              active={tab}
              onChange={changeTab}
              showMyDay={showMyDay}
              showChores={showChores}
              showHabits={showHabits}
              showPet={showPet}
              showKitchen={showKitchen}
            />
          </div>
        </div>
      )}

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

  // Waiting for Supabase to resolve the session. Show a branded app-shaped
  // skeleton (top bar + dock + cards) rather than a bare "Loading…" string, so
  // the cold-start hand-off reads as the app arriving, not a spinner.
  if (loading) {
    return (
      <div
        className="min-h-dvh bg-bg p-3 sm:p-6"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-6xl mx-auto animate-pulse">
          {/* top bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-2">
              <div className="h-6 w-40 bg-surface-2 rounded-md" />
              <div className="h-3 w-24 bg-surface-2 rounded-md" />
            </div>
            <div className="h-10 w-10 bg-surface-2 rounded-full" />
          </div>
          {/* content cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="h-32 bg-surface-2 rounded-2xl" />
            <div className="h-32 bg-surface-2 rounded-2xl" />
            <div className="h-32 bg-surface-2 rounded-2xl" />
          </div>
          <div className="h-48 bg-surface-2 rounded-2xl" />
        </div>
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
  // Hide the native launch splash once React has committed the first frame,
  // so the hand-off is splash -> content with no white/cream flash. A double
  // rAF ensures the browser has actually painted before we pull the splash.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        void hideSplash();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
