import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Search,
  Repeat,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { addDays, format } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { getMonday, mealTypeLabel } from '@/lib/kitchen';
import { hapticLight, hapticMedium } from '@/lib/native';
import { createEdgeAutoScroller } from '@/lib/dragAutoScroll';
import type { MealPlan, MealType, Recipe } from '@/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// How many days the planner shows at once: a full week on desktop, fewer on
// tablet/phone so the cells stay tappable (the 7-across grid was cramped on iPad).
function mealDayCount(): number {
  if (typeof window === 'undefined') return 7;
  const w = window.innerWidth;
  if (w < 640) return 3; // phone
  if (w < 1024) return 4; // tablet / iPad portrait
  return 7; // desktop
}

function useMealDayCount(): number {
  const [count, setCount] = useState(mealDayCount);
  useEffect(() => {
    const onResize = () => setCount(mealDayCount());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return count;
}

// A floating chip that follows the pointer during a drag, so a recipe / meal
// physically moves with the finger to its target day (matches the Calendar).
function makeDragGhost(label: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = label;
  el.style.cssText =
    'position:fixed;left:0;top:0;z-index:200;pointer-events:none;' +
    'padding:4px 10px;border-radius:8px;font-size:12px;font-weight:500;' +
    'max-width:220px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;' +
    'background:rgb(var(--surface));color:rgb(var(--text));' +
    'border:1px solid rgb(var(--accent));box-shadow:0 10px 24px -8px rgba(0,0,0,0.35);';
  return el;
}

export function MealPlannerView() {
  const {
    recipes,
    mealPlans,
    addMealPlan,
    removeMealPlan,
    moveMealPlan,
    updateMealPlan,
    repeatMealPlan,
    activeMember,
  } = useFamily();
  const [repeatTargetId, setRepeatTargetId] = useState<string | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const dayCount = useMealDayCount();
  // First visible day of the window. Anchored to the start of the week (Monday)
  // so the planner lines up with the Calendar and Shopping list — a meal placed
  // earlier this week stays visible here instead of falling before "today".
  // Paging moves by a whole window (dayCount days).
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<MealType>('dinner');
  const [query, setQuery] = useState('');
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const days = useMemo(
    () =>
      Array.from({ length: dayCount }, (_, i) => {
        const d = addDays(new Date(weekStart), i);
        return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE'), day: format(d, 'd') };
      }),
    [weekStart, dayCount],
  );

  const weekEnd = days[days.length - 1].date;

  // Match the Calendar week header format exactly, e.g. "8 Jun – 14 Jun".
  const rangeLabel = `${format(new Date(weekStart), 'd MMM')} – ${format(new Date(weekEnd), 'd MMM')}`;

  function shiftWeek(delta: number) {
    setWeekStart(format(addDays(new Date(weekStart), delta * dayCount), 'yyyy-MM-dd'));
  }
  function goToday() {
    setWeekStart(getMonday(new Date()));
  }

  const plansThisWeek = useMemo(
    () => mealPlans.filter((m) => m.date >= weekStart && m.date <= weekEnd),
    [mealPlans, weekStart, weekEnd],
  );

  // Default sidebar list (no search): up to 10 most-recently-used recipes,
  // topped up with favourites (then any remaining recipes) if there are fewer
  // than 10 recent — so the panel is useful even with little meal history.
  const defaultRecipes = useMemo(() => {
    const LIMIT = 10;
    const lastUsed = new Map<string, string>();
    for (const mp of mealPlans) {
      const cur = lastUsed.get(mp.recipe_id);
      if (!cur || mp.date > cur) lastUsed.set(mp.recipe_id, mp.date);
    }
    const recent = recipes
      .filter((r) => lastUsed.has(r.id))
      .sort((a, b) => (lastUsed.get(b.id) ?? '').localeCompare(lastUsed.get(a.id) ?? ''));
    const out = recent.slice(0, LIMIT);
    if (out.length < LIMIT) {
      const have = new Set(out.map((r) => r.id));
      // Favourites first, then any other recipes, alphabetical — to fill the gap.
      const fillers = recipes
        .filter((r) => !have.has(r.id))
        .sort((a, b) => {
          if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
          return a.title.localeCompare(b.title);
        });
      for (const r of fillers) {
        if (out.length >= LIMIT) break;
        out.push(r);
      }
    }
    return out;
  }, [recipes, mealPlans]);

  const sidebarRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return defaultRecipes;
    return recipes
      .filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.ingredients.some((i) => i.item.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [recipes, query, defaultRecipes]);

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

  // Pointer-event drag: recipe chips dragged onto day cells. We track the
  // recipe being dragged in a ref because the drop detection runs in a
  // global pointermove and pointerup loop (HTML5 DnD does not work on iOS).
  const draggingRecipeRef = useRef<string | null>(null);
  const draggingMealRef = useRef<string | null>(null);

  // Shared hit-test: which day cell (data-meal-day) is under the pointer.
  const findDayAt = (clientX: number, clientY: number): string | null => {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const cell = (el as HTMLElement).closest?.('[data-meal-day]') as HTMLElement | null;
      if (cell) return cell.dataset.mealDay ?? null;
    }
    return null;
  };

  function startRecipeDrag(recipeId: string, downEv: React.PointerEvent) {
    if (downEv.button !== undefined && downEv.button !== 0) return;
    const target = downEv.currentTarget as HTMLElement;
    const startX = downEv.clientX;
    const startY = downEv.clientY;
    let started = false;
    let ghostEl: HTMLDivElement | null = null;
    const pointerId = downEv.pointerId;
    const autoScroll = createEdgeAutoScroller();

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientY - startY) < 6 && Math.abs(ev.clientX - startX) < 6) return;
        started = true;
        // Match the rest of the app's drag lift-off cue.
        void hapticLight();
        try {
          target.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        draggingRecipeRef.current = recipeId;
        const r = recipes.find((x) => x.id === recipeId);
        ghostEl = makeDragGhost(`${r?.icon || '🍽️'} ${r?.title ?? 'Meal'}`.trim());
        document.body.appendChild(ghostEl);
        target.style.opacity = '0.4';
      }
      autoScroll.update(ev.clientX, ev.clientY);
      setDragOverDay(findDayAt(ev.clientX, ev.clientY));
      if (ghostEl) ghostEl.style.transform = `translate(${ev.clientX + 10}px, ${ev.clientY + 10}px)`;
      ev.preventDefault();
    };
    const cleanup = () => {
      autoScroll.stop();
      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
      target.style.opacity = '';
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      const dropTarget = started ? findDayAt(ev.clientX, ev.clientY) : null;
      const recipe = draggingRecipeRef.current;
      draggingRecipeRef.current = null;
      setDragOverDay(null);
      if (started && dropTarget && recipe) {
        void hapticMedium();
        handleAdd(recipe, dropTarget, selectedMealType);
      }
    };
    const cancel = () => {
      cleanup();
      draggingRecipeRef.current = null;
      setDragOverDay(null);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
  }

  // Drag an already-placed meal chip to another day. Mirrors startRecipeDrag
  // but commits a move (handleMoveMeal) instead of an add.
  function startMealMove(mealPlanId: string, downEv: React.PointerEvent) {
    if (downEv.button !== undefined && downEv.button !== 0) return;
    // Let the chip's repeat/remove buttons handle their own taps.
    if ((downEv.target as HTMLElement).closest('button')) return;
    const target = downEv.currentTarget as HTMLElement;
    const startX = downEv.clientX;
    const startY = downEv.clientY;
    let started = false;
    let ghostEl: HTMLDivElement | null = null;
    const pointerId = downEv.pointerId;
    const autoScroll = createEdgeAutoScroller();

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientY - startY) < 6 && Math.abs(ev.clientX - startX) < 6) return;
        started = true;
        void hapticLight();
        try {
          target.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        draggingMealRef.current = mealPlanId;
        const mp = mealPlans.find((m) => m.id === mealPlanId);
        const r = recipes.find((x) => x.id === mp?.recipe_id);
        ghostEl = makeDragGhost(`${r?.icon || '🍽️'} ${r?.title ?? 'Meal'}`.trim());
        document.body.appendChild(ghostEl);
        target.style.opacity = '0.4';
      }
      autoScroll.update(ev.clientX, ev.clientY);
      setDragOverDay(findDayAt(ev.clientX, ev.clientY));
      if (ghostEl) ghostEl.style.transform = `translate(${ev.clientX + 10}px, ${ev.clientY + 10}px)`;
      ev.preventDefault();
    };
    const cleanup = () => {
      autoScroll.stop();
      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
      target.style.opacity = '';
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      const dropTarget = started ? findDayAt(ev.clientX, ev.clientY) : null;
      const id = draggingMealRef.current;
      draggingMealRef.current = null;
      setDragOverDay(null);
      if (started && dropTarget && id) {
        void hapticMedium();
        moveMealPlan(id, dropTarget);
      }
    };
    const cancel = () => {
      cleanup();
      draggingMealRef.current = null;
      setDragOverDay(null);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
  }

  return (
    <div>
      {/* Week navigation — mirrors the Calendar toolbar: a self-contained card
          with one balanced row (grouped nav left, prominent centred date range,
          meal-type filter right). Chips wrap below on narrow phones. */}
      <div className="card p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Left: navigation */}
          <div className="flex items-center shrink-0">
            <button
              onClick={() => shiftWeek(-1)}
              className="w-8 sm:w-9 min-h-[40px] rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToday}
              className="px-2 sm:px-3 min-h-[40px] rounded-md text-xs sm:text-sm text-text-muted hover:bg-surface-2"
            >
              Today
            </button>
            <button
              onClick={() => shiftWeek(1)}
              className="w-8 sm:w-9 min-h-[40px] rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Date range — kept on the left, just after the nav; mr-auto pushes
              the meal-type filter to the far right. */}
          <div className="min-w-0 truncate mr-auto px-1 font-display text-sm sm:text-lg text-text">
            {rangeLabel}
          </div>

          {/* Right: meal-type filter */}
          <div className="flex items-center gap-1 text-xs shrink-0">
            {MEAL_TYPES.map((mt) => (
              <button
                key={mt}
                onClick={() => setSelectedMealType(mt)}
                className={`px-2 py-1.5 rounded-md transition ${selectedMealType === mt ? 'bg-accent-strong text-white' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
              >
                {mealTypeLabel(mt)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Recipe sidebar — LHS to match the rest of the create-flows. */}
        <aside className="lg:w-[270px] flex-shrink-0 order-2 lg:order-1">
          <div className="card p-3 lg:sticky lg:top-20 overflow-hidden">
            <div className="flex items-center justify-between p-2 mb-1">
              <h2 className="font-display text-base text-text">Recipes</h2>
            </div>
            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-surface-2 border border-border focus-within:border-accent min-w-0">
              <Search size={13} className="text-text-faint shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none min-w-0"
              />
            </div>
            <p className="text-xs text-text-faint mb-2">
              {query.trim()
                ? 'Drag to a day, or click + Add'
                : 'Recent & favourites — search for more'}
            </p>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {sidebarRecipes.length === 0 ? (
                <p className="text-xs text-text-faint p-2">
                  {query.trim()
                    ? 'No recipes found.'
                    : 'No recipes yet — add some on the Recipes tab.'}
                </p>
              ) : (
                sidebarRecipes.map((r) => (
                  <div
                    key={r.id}
                    style={{ touchAction: 'none' }}
                    onPointerDown={(e) => startRecipeDrag(r.id, e)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm bg-surface-2 hover:bg-surface-3 cursor-grab active:cursor-grabbing transition min-w-0 select-none"
                    onClick={() => selectedDay && handleAdd(r.id, selectedDay)}
                  >
                    <span className="text-base shrink-0">{r.icon || '🍽️'}</span>
                    <span className="flex-1 truncate text-text min-w-0">{r.title}</span>
                    {r.favorite && (
                      <Heart size={11} className="text-red-500 shrink-0" fill="currentColor" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Calendar */}
        <div className="flex-1 order-1 lg:order-2">
          {recipes.length === 0 && (
            <div className="card p-4 mb-3 text-center text-sm text-text-faint">
              <p className="text-text font-medium mb-0.5">No recipes to plan with yet</p>
              <p>Add a recipe on the Recipes tab, then drag it onto a day here.</p>
            </div>
          )}
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }}
          >
            {days.map(({ date, label, day }) => {
              const dayPlans = plansForDay(date);
              const isToday = date === format(new Date(), 'yyyy-MM-dd');
              const isOver = dragOverDay === date;
              return (
                <div
                  key={date}
                  data-meal-day={date}
                  className={`card min-h-24 p-2 flex flex-col transition ${isOver ? 'ring-2 ring-accent' : ''}`}
                >
                  <div
                    className={`text-center mb-1 ${isToday ? 'text-accent font-bold' : 'text-text-muted'}`}
                  >
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
                          onEdit={() => setEditTargetId(mp.id)}
                          onMoveStart={(e) => startMealMove(mp.id, e)}
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
            Adding to <strong>{format(new Date(selectedDay), 'EEEE, MMM d')}</strong> — click a
            recipe above
          </p>
          <button
            onClick={() => setSelectedDay(null)}
            className="text-xs text-text-faint hover:text-text"
          >
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

      {editTargetId && (
        <MealEditModal
          mealPlan={mealPlans.find((m) => m.id === editTargetId) ?? null}
          recipe={(() => {
            const mp = mealPlans.find((m) => m.id === editTargetId);
            return mp ? recipes.find((r) => r.id === mp.recipe_id) : undefined;
          })()}
          onClose={() => setEditTargetId(null)}
          onSave={(patch) => {
            updateMealPlan(editTargetId, patch);
            setEditTargetId(null);
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
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(sourceWeekday !== null ? [sourceWeekday] : []),
  );
  const [weeks, setWeeks] = useState(4);
  // Labelled "Forever" in the UI, but meals are materialised rows so it can't be
  // truly unbounded — "forever" = 104 weeks (2 years) of plans, a practical upper
  // bound. (Next-version: give meals a real recurrence rule for genuine forever.)
  const INDEFINITE_WEEKS = 104;
  const [indefinite, setIndefinite] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mealPlan) return null;

  const toggle = (wd: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(wd)) next.delete(wd);
      else next.add(wd);
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
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-text-muted">
          Copy{' '}
          <strong>
            {recipe?.icon || '🍽️'} {recipe?.title ?? 'this meal'}
          </strong>{' '}
          ({mealTypeLabel(mealPlan.meal_type)}) onto these weekdays:
        </p>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label, wd) => {
            const active = selected.has(wd);
            return (
              <button
                key={wd}
                onClick={() => toggle(wd)}
                className={
                  'py-2 rounded-md text-xs font-medium border-2 transition-[transform,opacity,background-color,border-color,color,box-shadow] active:scale-95 ' +
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
            <span>{indefinite ? 'Forever' : `${weeks} week${weeks === 1 ? '' : 's'}`}</span>
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
            Repeat forever
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5 rounded-xl">
            Cancel
          </button>
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

// Modal — change a placed meal's slot (type) and servings.
function MealEditModal({
  mealPlan,
  recipe,
  onClose,
  onSave,
}: {
  mealPlan: MealPlan | null;
  recipe?: Recipe;
  onClose: () => void;
  onSave: (patch: { meal_type: MealType; servings: number }) => void;
}) {
  const [mealType, setMealType] = useState<MealType>(mealPlan?.meal_type ?? 'dinner');
  const [servings, setServings] = useState(mealPlan?.servings ?? 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mealPlan) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="card max-w-sm w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-text">Edit meal</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-text-muted">
          <strong>
            {recipe?.icon || '🍽️'} {recipe?.title ?? 'this meal'}
          </strong>
        </p>
        <div className="space-y-2">
          <span className="text-xs font-medium text-text-muted">Meal</span>
          <div className="grid grid-cols-4 gap-1">
            {MEAL_TYPES.map((mt) => (
              <button
                key={mt}
                onClick={() => setMealType(mt)}
                className={
                  'py-2 rounded-md text-xs font-medium border-2 transition active:scale-95 ' +
                  (mealType === mt
                    ? 'border-accent bg-accent-soft text-text'
                    : 'border-border text-text-muted hover:border-border-strong')
                }
              >
                {mealTypeLabel(mt)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-muted flex items-center justify-between">
            <span>Servings</span>
            <span className="tabular-nums">{servings}</span>
          </label>
          <input
            type="range"
            min="1"
            max="12"
            step="1"
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5 rounded-xl">
            Cancel
          </button>
          <button
            onClick={() => onSave({ meal_type: mealType, servings })}
            className="btn-primary flex-1 py-2.5 rounded-xl"
          >
            Save
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
  onEdit,
  onMoveStart,
}: {
  mealPlan: MealPlan;
  recipe?: Recipe;
  onRemove: () => void;
  onRepeat: () => void;
  onEdit: () => void;
  onMoveStart: (e: React.PointerEvent) => void;
}) {
  // A "⋯" menu (Edit / Repeat / Delete) instead of hover-only buttons, so the
  // actions are reachable on touch (iOS has no hover). Drag still works on the
  // chip body; the buttons are skipped by startMealMove's button guard.
  const [menuOpen, setMenuOpen] = useState(false);

  const item = 'flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-surface-2';
  return (
    <div
      style={{ touchAction: 'none' }}
      onPointerDown={onMoveStart}
      className="relative bg-accent-soft rounded px-1.5 py-0.5 flex items-center gap-1 text-xs cursor-grab active:cursor-grabbing select-none"
    >
      <span>{recipe?.icon || '🍽️'}</span>
      <span className="truncate text-text flex-1 leading-tight">
        {recipe?.title ?? 'Unknown'}
        <span className="text-text-faint ml-0.5">· {mealTypeLabel(mealPlan.meal_type)}</span>
      </span>
      <button
        data-no-swipe
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className="shrink-0 -mr-0.5 p-0.5 text-text-faint hover:text-text"
        title="Meal actions"
        aria-label="Meal actions"
      >
        <MoreHorizontal size={13} />
      </button>
      {/* Action sheet rendered as a fixed overlay so it isn't clipped by the
          day cell's `overflow:hidden` (which broke the old inline dropdown). */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(false);
          }}
        >
          <div
            className="card w-full max-w-xs cursor-default overflow-hidden py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm text-text">
              <span>{recipe?.icon || '🍽️'}</span>
              <span className="truncate font-medium">{recipe?.title ?? 'Meal'}</span>
            </div>
            <button
              data-no-swipe
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onEdit();
              }}
              className={item + ' text-text'}
            >
              <Pencil size={15} /> Edit
            </button>
            <button
              data-no-swipe
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onRepeat();
              }}
              className={item + ' text-text'}
            >
              <Repeat size={15} /> Repeat
            </button>
            <button
              data-no-swipe
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onRemove();
              }}
              className={item + ' text-red-500'}
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
