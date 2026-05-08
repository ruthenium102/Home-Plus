import { useState } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { FamilyProvider, useFamily } from '@/context/FamilyContext';
import { TopBar } from '@/components/TopBar';
import { TabBar, type TabKey } from '@/components/TabBar';
import { UserSwitcher } from '@/components/UserSwitcher';
import { HomePage } from '@/pages/HomePage';
import { CalendarPage } from '@/pages/CalendarPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ChoresPage } from '@/pages/ChoresPage';
import { ListsPage } from '@/pages/ListsPage';
import { HabitsPage } from '@/pages/HabitsPage';
import { KitchenPage } from '@/pages/Placeholders';

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
          {tab === 'calendar' && <CalendarPage />}
          {tab === 'chores' && <ChoresPage />}
          {tab === 'lists' && <ListsPage />}
          {tab === 'habits' && <HabitsPage />}
          {tab === 'kitchen' && <KitchenPage />}
          {tab === 'settings' && <SettingsPage />}
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
      <FamilyProvider>
        <AppShell />
      </FamilyProvider>
    </ThemeProvider>
  );
}
