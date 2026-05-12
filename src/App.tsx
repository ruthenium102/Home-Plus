import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { FamilyProvider, useFamily } from '@/context/FamilyContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { WeatherProvider } from '@/hooks/useWeather';
import { TopBar } from '@/components/TopBar';
import { TabBar, type TabKey } from '@/components/TabBar';
import { UserSwitcher } from '@/components/UserSwitcher';
import { HomePage } from '@/pages/HomePage';
import { TabFallback } from '@/components/TabFallback';
import { isSupabaseConfigured } from '@/lib/supabase';

// Lazy-load tab pages so the lock screen + home tab load fast.
// Each chunk is fetched on first visit to that tab.
const CalendarPage = lazy(() =>
  import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage }))
);
const ChoresPage = lazy(() =>
  import('@/pages/ChoresPage').then((m) => ({ default: m.ChoresPage }))
);
const ListsPage = lazy(() =>
  import('@/pages/ListsPage').then((m) => ({ default: m.ListsPage }))
);
const HabitsPage = lazy(() =>
  import('@/pages/HabitsPage').then((m) => ({ default: m.HabitsPage }))
);
const KitchenPage = lazy(() =>
  import('@/pages/KitchenPage').then((m) => ({ default: m.KitchenPage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const MyDayPage = lazy(() =>
  import('@/pages/MyDayPage').then((m) => ({ default: m.MyDayPage }))
);
const AuthPage = lazy(() =>
  import('@/pages/AuthPage').then((m) => ({ default: m.AuthPage }))
);

function AppShell() {
  const { activeMember } = useFamily();
  const showMyDay = activeMember?.my_day_enabled ?? false;
  const showChores = activeMember?.chores_enabled ?? true;
  const showHabits = activeMember?.habits_enabled ?? true;
  const showKitchen = activeMember?.kitchen_enabled ?? false;
  const [tab, setTab] = useState<TabKey>('home');
  const [switcherOpen, setSwitcherOpen] = useState(false);

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
    <div className="min-h-screen bg-bg">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-28">
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
              {tab === 'settings' && <SettingsPage />}
            </Suspense>
          )}
        </main>
      </div>

      {/* Sticky bottom tab bar */}
      <div className="fixed bottom-3 left-3 right-3 sm:left-6 sm:right-6 z-30">
        <div className="max-w-6xl mx-auto">
          <TabBar
            active={tab}
            onChange={setTab}
            showMyDay={showMyDay}
            showChores={showChores}
            showHabits={showHabits}
            showKitchen={showKitchen}
          />
        </div>
      </div>

      {switcherOpen && <UserSwitcher onClose={() => setSwitcherOpen(false)} />}
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
      <div className="min-h-screen bg-bg flex items-center justify-center">
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
