import { useState } from 'react';
import { X, Trash2, Plus, ExternalLink, Mail } from 'lucide-react';
import { guessRecipeIcon, tryHostname } from '@/lib/kitchen';
import type { Ingredient, Recipe } from '@/types';

interface Props {
  recipe: Partial<Recipe>;
  onSave: (r: Omit<Recipe, 'id' | 'created_at' | 'family_id'>) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function RecipeEditor({ recipe, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(recipe.title ?? '');
  const [icon, setIcon] = useState(recipe.icon ?? '');
  const [servings, setServings] = useState(recipe.servings ?? 4);
  const [prepMinutes, setPrepMinutes] = useState<string>(recipe.prep_minutes != null ? String(recipe.prep_minutes) : '');
  const [cookMinutes, setCookMinutes] = useState<string>(recipe.cook_minutes != null ? String(recipe.cook_minutes) : '');
  const [sourceUrl, setSourceUrl] = useState(recipe.source_url ?? '');
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe.ingredients?.length
      ? recipe.ingredients.map((i) => ({ quantity: i.quantity, unit: i.unit || '', item: i.item || '' }))
      : [{ quantity: null, unit: '', item: '' }]
  );
  const [steps, setSteps] = useState<string[]>(recipe.steps?.length ? recipe.steps : ['']);
  const [notes, setNotes] = useState(recipe.notes ?? '');

  const suggestedIcon = title ? guessRecipeIcon(title) : '🍽️';
  const displayedIcon = icon || suggestedIcon;

  function handleSave() {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      icon: icon || suggestedIcon,
      servings: Number(servings) || 4,
      prep_minutes: prepMinutes ? Number(prepMinutes) : null,
      cook_minutes: cookMinutes ? Number(cookMinutes) : null,
      source_url: sourceUrl.trim() || null,
      ingredients: ingredients
        .filter((i) => i.item.trim())
        .map((i) => ({
          quantity: i.quantity === null || String(i.quantity) === '' ? null : Number(i.quantity),
          unit: i.unit.trim(),
          item: i.item.trim(),
        })),
      steps: steps.filter((s) => s.trim()),
      notes: notes.trim() || null,
      favorite: recipe.favorite ?? false,
      created_by: recipe.created_by ?? null,
    });
  }

  function handleEmail() {
    const lines: string[] = [title, ''];
    if (servings) lines.push(`Serves: ${servings}`);
    if (prepMinutes) lines.push(`Prep: ${prepMinutes} min`);
    if (cookMinutes) lines.push(`Cook: ${cookMinutes} min`);
    lines.push('', 'INGREDIENTS');
    ingredients.filter((i) => i.item.trim()).forEach((i) => {
      const qty = i.quantity != null ? `${i.quantity} ` : '';
      const unit = i.unit ? `${i.unit} ` : '';
      lines.push(`- ${qty}${unit}${i.item}`);
    });
    lines.push('', 'METHOD');
    steps.filter((s) => s.trim()).forEach((s, idx) => lines.push(`${idx + 1}. ${s}`));
    if (notes.trim()) lines.push('', 'NOTES', notes);
    if (sourceUrl) lines.push('', `Source: ${sourceUrl}`);
    lines.push('', '— Sent from Home Plus');
    window.location.href = `mailto:?subject=${encodeURIComponent(`Recipe: ${title}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

  function updateIngredient(i: number, field: keyof Ingredient, value: string | number | null) {
    const next = [...ingredients];
    next[i] = { ...next[i], [field]: value };
    setIngredients(next);
  }

  function addIngredient() {
    setIngredients([...ingredients, { quantity: null, unit: '', item: '' }]);
  }

  function removeIngredient(i: number) {
    setIngredients(ingredients.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, val: string) {
    const next = [...steps];
    next[i] = val;
    setSteps(next);
  }

  function addStep() {
    setSteps([...steps, '']);
  }

  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-20 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-surface z-10">
          <h2 className="font-display text-xl text-text">{recipe.id ? 'Edit Recipe' : 'New Recipe'}</h2>
          <div className="flex items-center gap-2">
            {recipe.id && (
              <button
                onClick={handleEmail}
                className="btn-ghost flex items-center gap-1 text-sm"
                title="Email recipe"
              >
                <Mail size={14} />Email
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="btn-ghost text-red-500 hover:text-red-700 flex items-center gap-1 text-sm">
                <Trash2 size={14} />Delete
              </button>
            )}
            <button onClick={onClose} className="text-text-faint hover:text-text"><X size={20} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Icon + Title */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                const emoji = window.prompt('Enter an emoji for this recipe', displayedIcon);
                if (emoji) setIcon(emoji.trim().slice(0, 4));
              }}
              className="text-3xl w-12 h-12 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0 hover:bg-surface-3 transition"
              title="Change icon"
            >
              {displayedIcon}
            </button>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Recipe title"
              className="input flex-1 text-lg font-medium"
              autoFocus={!recipe.title}
            />
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-text-faint block mb-1">Serves</label>
              <input
                type="number"
                value={servings}
                onChange={(e) => setServings(Number(e.target.value))}
                min={1}
                max={100}
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs text-text-faint block mb-1">Prep (min)</label>
              <input
                type="number"
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(e.target.value)}
                placeholder="—"
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs text-text-faint block mb-1">Cook (min)</label>
              <input
                type="number"
                value={cookMinutes}
                onChange={(e) => setCookMinutes(e.target.value)}
                placeholder="—"
                className="input w-full"
              />
            </div>
          </div>

          {/* Source URL */}
          <div>
            <label className="text-xs text-text-faint block mb-1">Source URL</label>
            <div className="flex gap-2">
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…"
                className="input flex-1"
              />
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost flex items-center gap-1 text-sm">
                  <ExternalLink size={14} />
                  {tryHostname(sourceUrl)}
                </a>
              )}
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-text">Ingredients</label>
              <button onClick={addIngredient} className="btn-ghost text-sm flex items-center gap-1">
                <Plus size={14} />Add
              </button>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={ing.quantity ?? ''}
                    onChange={(e) => updateIngredient(i, 'quantity', e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="Qty"
                    className="input w-16 text-center"
                  />
                  <input
                    value={ing.unit}
                    onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="input w-20"
                  />
                  <input
                    value={ing.item}
                    onChange={(e) => updateIngredient(i, 'item', e.target.value)}
                    placeholder="Ingredient"
                    className="input flex-1"
                  />
                  <button
                    onClick={() => removeIngredient(i)}
                    className="text-text-faint hover:text-red-500 transition"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-text">Method</label>
              <button onClick={addStep} className="btn-ghost text-sm flex items-center gap-1">
                <Plus size={14} />Add step
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-xs text-text-faint mt-2.5 w-5 text-right flex-shrink-0">{i + 1}.</span>
                  <textarea
                    value={step}
                    onChange={(e) => updateStep(i, e.target.value)}
                    rows={2}
                    placeholder={`Step ${i + 1}`}
                    className="input flex-1 resize-none"
                  />
                  <button
                    onClick={() => removeStep(i)}
                    className="text-text-faint hover:text-red-500 transition mt-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-text-faint block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tips, variations, dietary notes…"
              rows={3}
              className="input w-full resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-surface">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={!title.trim()} className="btn-primary">
            Save recipe
          </button>
        </div>
      </div>
    </div>
  );
}
