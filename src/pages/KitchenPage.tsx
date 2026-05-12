import { useState } from 'react';
import { BookOpen, Calendar, ShoppingCart, BarChart3, Settings } from 'lucide-react';
import { RecipesView } from '@/components/kitchen/RecipesView';
import { MealPlannerView } from '@/components/kitchen/MealPlannerView';
import { ShoppingView } from '@/components/kitchen/ShoppingView';
import { StatsView } from '@/components/kitchen/StatsView';
import { KitchenSettingsView } from '@/components/kitchen/KitchenSettingsView';

type KitchenTab = 'recipes' | 'planner' | 'shopping' | 'stats' | 'settings';

const TABS: { id: KitchenTab; label: string; icon: React.ReactNode }[] = [
  { id: 'recipes', label: 'Recipes', icon: <BookOpen size={16} /> },
  { id: 'planner', label: 'Planner', icon: <Calendar size={16} /> },
  { id: 'shopping', label: 'Shopping', icon: <ShoppingCart size={16} /> },
  { id: 'stats', label: 'Stats', icon: <BarChart3 size={16} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
];

export function KitchenPage() {
  const [tab, setTab] = useState<KitchenTab>('recipes');

  return (
    <div>
      {/* Sub-navigation */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              tab === id
                ? 'bg-accent text-white'
                : 'text-text-muted hover:bg-surface-2'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === 'recipes' && <RecipesView />}
      {tab === 'planner' && <MealPlannerView />}
      {tab === 'shopping' && <ShoppingView />}
      {tab === 'stats' && <StatsView />}
      {tab === 'settings' && <KitchenSettingsView />}
    </div>
  );
}
