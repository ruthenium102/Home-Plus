import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Heart, Search } from 'lucide-react';
import { addDays, format, startOfWeek } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { getMonday, mealTypeLabel } from '@/lib/kitchen';
import type { MealPlan, MealType, Recipe } from '@/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function MealPlannerView() {
  const { recipes, mealPlans, addMealPlan, removeMealPlan, activeMember } = useFamily();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<MealType>('dinner');
  const [query, setQuery] = useState('');
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const days = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(new Date(weekStart), i);
      return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE'), day: format(d, 'd') };
    }),
    [weekStart]
  );

  const weekEnd = days[6].date;

  function shiftWeek(delta: number) {
    const d = addDays(new Date(weekStart), delta * 7);
    setWeekStart(format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  }

  const plansThisWeek = useMemo(
    () => mealPlans.filter((m) => m.date >= weekStart && m.date <= weekEnd),
    [mealPlans, weekStart, weekEnd]
  );

  const sidebarRecipes = useMemo(() => {
    const q = query.toLowerCase();
    return recipes
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.item.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [recipes, query]);

  function plansForDay(date: string) {
    return plansThisWeek.filter((m) => m.date === date);
  }

  function handleAdd(recipeId: string, date: string, mealType: MealType = selectedMealType) {
    const recipe = recipes.find((r) => r.id === recipeId);
    addMealPlan({
      recipe_id: recipeId,
      date,
      meal_type: mealType,
      servings: recipe?.servings ?? 4,
      notes: null,
      created_by: activeMember?.id ?? null,
      calendar_event_id: null,
    });
    setSelectedDay(null);
  }

  function handleDragStart(e: React.DragEvent, recipeId: string) {
    e.dataTransfer.setData('recipe-id', recipeId);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleDrop(e: React.DragEvent, dateStr: string) {
    e.preventDefault();
    setDragOverDay(null);
    const recipeId = e.dataTransfer.getData('recipe-id');
    if (recipeId) handleAdd(recipeId, dateStr, selectedMealType);
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="font-display text-xl text-text">Meal Plan</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} className="btn-ghost p-1.5"><ChevronLeft size={18} /></button>
          <span className="text-sm text-text-muted min-w-36 text-center">
            {format(new Date(weekStart), 'MMM d')} – {format(new Date(weekEnd), 'MMM d, yyyy')}
          </span>
          <button onClick={() => shiftWeek(1)} className="btn-ghost p-1.5"><ChevronRight size={18} /></button>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt}
              onClick={() => setSelectedMealType(mt)}
              className={`px-2 py-1 rounded-md transition ${selectedMealType === mt ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
            >
              {mealTypeLabel(mt)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar */}
        <div className="flex-1 order-1">
          <div className="grid grid-cols-7 gap-1">
            {days.map(({ date, label, day }) => {
              const dayPlans = plansForDay(date);
              const isToday = date === format(new Date(), 'yyyy-MM-dd');
              const isOver = dragOverDay === date;
              return (
                <div
                  key={date}
                  className={`card min-h-24 p-2 flex flex-col transition ${isOver ? 'ring-2 ring-accent' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverDay(date); }}
                  onDragLeave={() => setDragOverDay(null)}
                  onDrop={(e) => handleDrop(e, date)}
                >
                  <div className={`text-center mb-1 ${isToday ? 'text-accent font-bold' : 'text-text-muted'}`}>
                    <div className="text-xs">{label}</div>
                    <div className="text-sm">{day}</div>
                  </div>
                  <div className="flex-1 space-y-1">
                    {dayPlans.map((mp) => {
                      const recipe = recipes.find((r) => r.id === mp.recipe_id);
                      return (
                        <MealChip
                          key={mp.id}
                          mealPlan={mp}
                          recipe={recipe}
                          onRemove={() => removeMealPlan(mp.id)}
                        />
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setSelectedDay(selectedDay === date ? null : date)}
                    className="text-xs text-text-faint hover:text-accent mt-1 text-center w-full"
                  >
                    + Add
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recipe sidebar */}
        <aside className="lg:w-52 flex-shrink-0 order-2 lg:order-2">
          <div className="card p-3 lg:sticky lg:top-20">
            <div className="flex items-center gap-2 mb-2">
              <Search size={13} className="text-text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="input text-sm py-1 flex-1"
              />
            </div>
            <p className="text-xs text-text-faint mb-2">
              Drag to a day, or click + Add
            </p>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {sidebarRecipes.length === 0 ? (
                <p className="text-xs text-text-faint p-2">No recipes found.</p>
              ) : sidebarRecipes.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, r.id)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm bg-surface-2 hover:bg-surface-3 cursor-grab active:cursor-grabbing transition"
                  onClick={() => selectedDay && handleAdd(r.id, selectedDay)}
                >
                  <span className="text-base">{r.icon || '🍽️'}</span>
                  <span className="flex-1 truncate text-text">{r.title}</span>
                  {r.favorite && <Heart size={11} className="text-red-500 flex-shrink-0" fill="currentColor" />}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Day picker panel */}
      {selectedDay && (
        <div className="mt-3 card p-3">
          <p className="text-sm text-text-muted mb-2">
            Adding to <strong>{format(new Date(selectedDay), 'EEEE, MMM d')}</strong> — click a recipe above
          </p>
          <button onClick={() => setSelectedDay(null)} className="text-xs text-text-faint hover:text-text">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function MealChip({
  mealPlan,
  recipe,
  onRemove,
}: {
  mealPlan: MealPlan;
  recipe?: Recipe;
  onRemove: () => void;
}) {
  return (
    <div className="group relative bg-accent-soft rounded px-1.5 py-0.5 flex items-center gap-1 text-xs">
      <span>{recipe?.icon || '🍽️'}</span>
      <span className="truncate text-text flex-1 leading-tight">
        {recipe?.title ?? 'Unknown'}
        <span className="text-text-faint ml-0.5">· {mealTypeLabel(mealPlan.meal_type)}</span>
      </span>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-text-faint hover:text-red-500 flex-shrink-0 transition"
      >
        <X size={11} />
      </button>
    </div>
  );
}
