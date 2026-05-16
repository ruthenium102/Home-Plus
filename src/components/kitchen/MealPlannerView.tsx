import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Heart, Search, Repeat } from 'lucide-react';
import { addDays, format, startOfWeek } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { getMonday, mealTypeLabel } from '@/lib/kitchen';
import type { MealPlan, MealType, Recipe } from '@/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function MealPlannerView() {
  const { recipes, mealPlans, addMealPlan, removeMealPlan, repeatMealPlan, activeMember } = useFamily();
  const [repeatTargetId, setRepeatTargetId] = useState<string | null>(null);
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

  // Top 6 most-recently-used recipes (based on most recent meal plan date per recipe)
  const recentRecipes = useMemo(() => {
    const lastUsed = new Map<string, string>();
    for (const mp of mealPlans) {
      const cur = lastUsed.get(mp.recipe_id);
      if (!cur || mp.date > cur) lastUsed.set(mp.recipe_id, mp.date);
    }
    return recipes
      .filter((r) => lastUsed.has(r.id))
      .sort((a, b) => (lastUsed.get(b.id) ?? '').localeCompare(lastUsed.get(a.id) ?? ''))
      .slice(0, 6);
  }, [recipes, mealPlans]);

  const sidebarRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recentRecipes;
    return recipes
      .filter((r) => r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.item.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [recipes, query, recentRecipes]);

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
        {/* Recipe sidebar — LHS to match the rest of the create-flows. */}
        <aside className="lg:w-52 flex-shrink-0 order-2 lg:order-1">
          <div className="card p-3 lg:sticky lg:top-20 overflow-hidden">
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <Search size={13} className="text-text-faint shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="input text-sm py-1 flex-1 min-w-0"
              />
            </div>
            <p className="text-xs text-text-faint mb-2">
              {query.trim() ? 'Drag to a day, or click + Add' : 'Recently used — search for more'}
            </p>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {sidebarRecipes.length === 0 ? (
                <p className="text-xs text-text-faint p-2">
                  {query.trim() ? 'No recipes found.' : 'No recent meals yet — search to find recipes.'}
                </p>
              ) : sidebarRecipes.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, r.id)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm bg-surface-2 hover:bg-surface-3 cursor-grab active:cursor-grabbing transition min-w-0"
                  onClick={() => selectedDay && handleAdd(r.id, selectedDay)}
                >
                  <span className="text-base shrink-0">{r.icon || '🍽️'}</span>
                  <span className="flex-1 truncate text-text min-w-0">{r.title}</span>
                  {r.favorite && <Heart size={11} className="text-red-500 shrink-0" fill="currentColor" />}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Calendar */}
        <div className="flex-1 order-1 lg:order-2">
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
                          onRepeat={() => setRepeatTargetId(mp.id)}
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

      {repeatTargetId && (
        <RepeatMealModal
          mealPlan={mealPlans.find((m) => m.id === repeatTargetId) ?? null}
          recipe={(() => {
            const mp = mealPlans.find((m) => m.id === repeatTargetId);
            return mp ? recipes.find((r) => r.id === mp.recipe_id) : undefined;
          })()}
          onClose={() => setRepeatTargetId(null)}
          onApply={(weekdays, weeks) => {
            repeatMealPlan(repeatTargetId, weekdays, weeks);
            setRepeatTargetId(null);
          }}
        />
      )}
    </div>
  );
}

// Modal — pick weekdays + how many weeks forward to copy this meal.
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function RepeatMealModal({
  mealPlan,
  recipe,
  onClose,
  onApply,
}: {
  mealPlan: MealPlan | null;
  recipe?: Recipe;
  onClose: () => void;
  onApply: (weekdays: number[], weeks: number) => void;
}) {
  const sourceWeekday = mealPlan ? new Date(`${mealPlan.date}T00:00:00`).getDay() : null;
  const [selected, setSelected] = useState<Set<number>>(() => new Set(sourceWeekday !== null ? [sourceWeekday] : []));
  const [weeks, setWeeks] = useState(4);
  // "Indefinitely" = repeat for two years' worth of weeks (a practical upper
  // bound — the planner doesn't surface meals more than a few weeks out anyway).
  const INDEFINITE_WEEKS = 104;
  const [indefinite, setIndefinite] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mealPlan) return null;

  const toggle = (wd: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(wd) ? next.delete(wd) : next.add(wd);
      return next;
    });

  const apply = () => {
    // Exclude the source weekday — that day is already on the plan.
    const dest = [...selected].filter((wd) => wd !== sourceWeekday);
    onApply(dest.length > 0 ? dest : [...selected], indefinite ? INDEFINITE_WEEKS : weeks);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="card max-w-sm w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-text">Repeat meal</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none" aria-label="Close">×</button>
        </div>
        <p className="text-sm text-text-muted">
          Copy <strong>{recipe?.icon || '🍽️'} {recipe?.title ?? 'this meal'}</strong> ({mealTypeLabel(mealPlan.meal_type)}) onto these weekdays:
        </p>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label, wd) => {
            const active = selected.has(wd);
            return (
              <button
                key={wd}
                onClick={() => toggle(wd)}
                className={
                  'py-2 rounded-md text-xs font-medium border-2 transition-all active:scale-95 ' +
                  (active
                    ? 'border-accent bg-accent-soft text-text'
                    : 'border-border text-text-muted hover:border-border-strong')
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-muted flex items-center justify-between">
            <span>For how long?</span>
            <span>{indefinite ? 'Indefinitely' : `${weeks} week${weeks === 1 ? '' : 's'}`}</span>
          </label>
          <input
            type="range"
            min="1"
            max="12"
            step="1"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            disabled={indefinite}
            className="w-full disabled:opacity-40"
          />
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={indefinite}
              onChange={(e) => setIndefinite(e.target.checked)}
              className="accent-accent"
            />
            Repeat indefinitely (~2 years of plans)
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5 rounded-xl">Cancel</button>
          <button
            onClick={apply}
            disabled={selected.size === 0}
            className="btn-primary flex-1 py-2.5 rounded-xl disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function MealChip({
  mealPlan,
  recipe,
  onRemove,
  onRepeat,
}: {
  mealPlan: MealPlan;
  recipe?: Recipe;
  onRemove: () => void;
  onRepeat: () => void;
}) {
  return (
    <div className="group relative bg-accent-soft rounded px-1.5 py-0.5 flex items-center gap-1 text-xs">
      <span>{recipe?.icon || '🍽️'}</span>
      <span className="truncate text-text flex-1 leading-tight">
        {recipe?.title ?? 'Unknown'}
        <span className="text-text-faint ml-0.5">· {mealTypeLabel(mealPlan.meal_type)}</span>
      </span>
      <button
        onClick={onRepeat}
        className="opacity-0 group-hover:opacity-100 text-text-faint hover:text-accent flex-shrink-0 transition"
        title="Repeat this meal"
        aria-label="Repeat this meal"
      >
        <Repeat size={11} />
      </button>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-text-faint hover:text-red-500 flex-shrink-0 transition"
        title="Remove"
        aria-label="Remove meal"
      >
        <X size={11} />
      </button>
    </div>
  );
}
