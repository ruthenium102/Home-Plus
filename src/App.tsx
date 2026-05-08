import { lazy, Suspense, useState } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { FamilyProvider, useFamily } from '@/context/FamilyContext';
import { ToastProvider } from '@/context/ToastContext';
import { TopBar } from '@/components/TopBar';
import { TabBar, type TabKey } from '@/components/TabBar';
import { UserSwitcher } from '@/components/UserSwitcher';
import { HomePage } from '@/pages/HomePage';
import { TabFallback } from '@/components/TabFallback';

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
  import('@/pages/Placeholders').then((m) => ({ default: m.KitchenPage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

function AppShell() {
  const { activeMember } = useFamily();
  const [tab, setTab] = useState<TabKey>('home');
  const [switcherOpen, setSwitcherOpen] = useState(false);

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
              {tab === 'settings' && <SettingsPage />}
            </Suspense>
          )}
        </main>
      </div>

      {/* Sticky bottom tab bar */}
      <div className="fixed bottom-3 left-3 right-3 sm:left-6 sm:right-6 z-30">
        <div className="max-w-6xl mx-auto">
          <TabBar active={tab} onChange={setTab} />
        </div>
      </div>

      {switcherOpen && <UserSwitcher onClose={() => setSwitcherOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <FamilyProvider>
          <AppShell />
        </FamilyProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
