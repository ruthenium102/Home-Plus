import { useMemo, useState } from 'react';
import { BarChart3, Heart, TrendingUp, Calendar } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { format, subDays } from 'date-fns';

const RANGES = [
  { id: 'week', label: 'Last week', days: 7 },
  { id: 'month', label: 'Last month', days: 30 },
  { id: '3months', label: '3 months', days: 90 },
  { id: 'all', label: 'All time', days: null as number | null },
];

export function StatsView() {
  const { recipes, mealPlans } = useFamily();
  const [range, setRange] = useState('month');

  const stats = useMemo(() => {
    const r = RANGES.find((x) => x.id === range)!;
    const cutoffStr = r.days ? format(subDays(new Date(), r.days), 'yyyy-MM-dd') : null;
    const today = format(new Date(), 'yyyy-MM-dd');

    const inRange = mealPlans.filter((m) => !cutoffStr || m.date >= cutoffStr);
    const cooked = inRange.filter((m) => m.date <= today);

    const counts = new Map<string, number>();
    cooked.forEach((m) => counts.set(m.recipe_id, (counts.get(m.recipe_id) || 0) + 1));

    const ranked = [...counts.entries()]
      .map(([id, count]) => ({ recipe: recipes.find((r) => r.id === id), count }))
      .filter((x) => x.recipe)
      .sort((a, b) => b.count - a.count);

    const cookedIds = new Set(counts.keys());
    const neverCooked = recipes.filter((r) => !cookedIds.has(r.id));

    const upcoming = mealPlans
      .filter((m) => m.date > today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);

    return {
      totalCooked: cooked.length,
      uniqueRecipes: ranked.length,
      ranked: ranked.slice(0, 10),
      neverCooked,
      upcoming,
      totalRecipes: recipes.length,
      totalFavorites: recipes.filter((r) => r.favorite).length,
    };
  }, [recipes, mealPlans, range]);

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display text-xl text-text">Stats</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                range === r.id ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted hover:bg-surface-3'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<BarChart3 size={20} />} label="Meals cooked" value={stats.totalCooked} />
        <StatCard icon={<TrendingUp size={20} />} label="Recipes used" value={stats.uniqueRecipes} />
        <StatCard icon={<Heart size={20} className="text-red-500" />} label="Favourites" value={stats.totalFavorites} />
        <StatCard icon={<Calendar size={20} />} label="Upcoming" value={stats.upcoming.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Most cooked */}
        <div className="card p-4">
          <h3 className="font-medium text-text mb-3">Most cooked</h3>
          {stats.ranked.length === 0 ? (
            <p className="text-sm text-text-faint">No meals recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.ranked.map(({ recipe, count }) => (
                <div key={recipe!.id} className="flex items-center gap-2">
                  <span className="text-xl">{recipe!.icon || '🍽️'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm">
                      <span className="text-text truncate">{recipe!.title}</span>
                      <span className="text-text-faint ml-2 flex-shrink-0">{count}×</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${(count / stats.ranked[0].count) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming meals */}
        <div className="card p-4">
          <h3 className="font-medium text-text mb-3">Upcoming meals</h3>
          {stats.upcoming.length === 0 ? (
            <p className="text-sm text-text-faint">No meals planned ahead.</p>
          ) : (
            <div className="space-y-2">
              {stats.upcoming.map((mp) => {
                const recipe = recipes.find((r) => r.id === mp.recipe_id);
                return (
                  <div key={mp.id} className="flex items-center gap-2 text-sm">
                    <span className="text-lg">{recipe?.icon || '🍽️'}</span>
                    <span className="flex-1 text-text truncate">{recipe?.title ?? 'Unknown'}</span>
                    <span className="text-text-faint flex-shrink-0">
                      {format(new Date(mp.date), 'EEE d MMM')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Never cooked */}
        {stats.neverCooked.length > 0 && (
          <div className="card p-4 lg:col-span-2">
            <h3 className="font-medium text-text mb-3">Never cooked in this period ({stats.neverCooked.length})</h3>
            <div className="flex flex-wrap gap-2">
              {stats.neverCooked.map((r) => (
                <span key={r.id} className="flex items-center gap-1 px-2 py-1 bg-surface-2 rounded-full text-sm text-text-muted">
                  <span>{r.icon || '🍽️'}</span>{r.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="card p-4 text-center">
      <div className="flex justify-center text-accent mb-1">{icon}</div>
      <div className="text-2xl font-bold text-text">{value}</div>
      <div className="text-xs text-text-faint mt-0.5">{label}</div>
    </div>
  );
}
