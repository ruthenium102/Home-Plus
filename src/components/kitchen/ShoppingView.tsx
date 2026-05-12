import { useMemo, useState } from 'react';
import { ShoppingCart, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import {
  cleanIngredientName,
  displayIngredient,
  guessIngredientIcon,
  normalizeItem,
  formatQty,
  getMonday,
} from '@/lib/kitchen';

interface AggregatedItem {
  key: string;
  displayName: string;
  icon: string;
  unit: string;
  quantity: number;
  hasQuantity: boolean;
  recipeNames: string[];
}

export function ShoppingView() {
  const { recipes, mealPlans, kitchenSettings } = useFamily();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const weekEnd = format(addDays(new Date(weekStart), 6), 'yyyy-MM-dd');

  const cupboardSet = new Set(
    (kitchenSettings.cupboard || []).map((s) => s.toLowerCase().trim())
  );

  const weekPlans = useMemo(
    () => mealPlans.filter((m) => m.date >= weekStart && m.date <= weekEnd),
    [mealPlans, weekStart, weekEnd]
  );

  const items = useMemo(() => {
    const agg: Record<string, AggregatedItem> = {};

    weekPlans.forEach((plan) => {
      const recipe = recipes.find((r) => r.id === plan.recipe_id);
      if (!recipe) return;
      const scale = (plan.servings || recipe.servings || 4) / (recipe.servings || 4);

      (recipe.ingredients || []).forEach((ing) => {
        const cleaned = cleanIngredientName(ing.item);
        if (cupboardSet.has(cleaned) || cupboardSet.has((ing.item || '').toLowerCase().trim())) return;

        const normalizedKey = normalizeItem(cleaned);
        const unit = (ing.unit || '').toLowerCase();
        const key = `${normalizedKey}|${unit}`;

        if (!agg[key]) {
          agg[key] = {
            key,
            displayName: displayIngredient(cleaned),
            icon: guessIngredientIcon(cleaned),
            unit: ing.unit || '',
            quantity: 0,
            hasQuantity: false,
            recipeNames: [],
          };
        }

        if (ing.quantity != null && !isNaN(ing.quantity)) {
          agg[key].quantity += ing.quantity * scale;
          agg[key].hasQuantity = true;
        }

        if (!agg[key].recipeNames.includes(recipe.title)) {
          agg[key].recipeNames.push(recipe.title);
        }
      });
    });

    return Object.values(agg).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [weekPlans, recipes, cupboardSet]);

  function toggleChecked(key: string) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function shiftWeek(delta: number) {
    const d = addDays(new Date(weekStart), delta * 7);
    setWeekStart(format(d, 'yyyy-MM-dd'));
  }

  const remaining = items.filter((i) => !checked[i.key]);
  const done = items.filter((i) => checked[i.key]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-display text-xl text-text">Shopping List</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} className="btn-ghost p-1.5"><ChevronLeft size={18} /></button>
          <span className="text-sm text-text-muted min-w-40 text-center">
            {format(new Date(weekStart), 'MMM d')} – {format(new Date(weekEnd), 'MMM d')}
          </span>
          <button onClick={() => shiftWeek(1)} className="btn-ghost p-1.5"><ChevronRight size={18} /></button>
        </div>
      </div>

      {cupboardSet.size > 0 && (
        <p className="text-xs text-text-faint mb-3">
          Excluding {cupboardSet.size} cupboard item{cupboardSet.size !== 1 ? 's' : ''}: {[...cupboardSet].slice(0, 5).join(', ')}{cupboardSet.size > 5 ? ` +${cupboardSet.size - 5}` : ''}.
        </p>
      )}

      {items.length === 0 ? (
        <div className="card p-12 text-center text-text-faint">
          <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
          <p>Add recipes to your meal plan to generate a shopping list.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {remaining.map((item) => (
            <ShoppingItem key={item.key} item={item} checked={false} onToggle={() => toggleChecked(item.key)} />
          ))}

          {done.length > 0 && (
            <>
              <div className="text-xs text-text-faint uppercase tracking-wider pt-3 pb-1">Done ({done.length})</div>
              {done.map((item) => (
                <ShoppingItem key={item.key} item={item} checked onToggle={() => toggleChecked(item.key)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ShoppingItem({
  item,
  checked,
  onToggle,
}: {
  item: AggregatedItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const qtyStr = item.hasQuantity
    ? `${formatQty(item.quantity)}${item.unit ? ' ' + item.unit : ''}`
    : '';

  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-left ${
        checked ? 'bg-surface-2 opacity-50' : 'card hover:shadow-sm'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
          checked ? 'bg-accent border-accent' : 'border-border'
        }`}
      >
        {checked && <Check size={11} className="text-white" />}
      </div>
      {item.icon && <span className="text-lg">{item.icon}</span>}
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${checked ? 'line-through text-text-faint' : 'text-text'}`}>
          {item.displayName}
        </span>
        {item.recipeNames.length > 0 && (
          <span className="text-xs text-text-faint ml-2">
            ({item.recipeNames.join(', ')})
          </span>
        )}
      </div>
      {qtyStr && (
        <span className={`text-sm font-medium flex-shrink-0 ${checked ? 'text-text-faint' : 'text-text'}`}>
          {qtyStr}
        </span>
      )}
    </button>
  );
}
