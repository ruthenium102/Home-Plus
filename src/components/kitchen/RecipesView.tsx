import { useMemo, useState } from 'react';
import { Plus, Heart, Clock, Search, Link, ExternalLink } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { RecipeEditor } from './RecipeEditor';
import { ImportModal } from './ImportModal';
import { guessRecipeIcon, tryHostname } from '@/lib/kitchen';
import type { Recipe } from '@/types';

export function RecipesView() {
  const { recipes, addRecipe, updateRecipe, deleteRecipe, toggleRecipeFavorite, activeMember } = useFamily();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<Recipe> | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [filterFav, setFilterFav] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return recipes
      .filter((r) => {
        if (filterFav && !r.favorite) return false;
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.ingredients.some((i) => i.item.toLowerCase().includes(q)) ||
          (r.notes ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [recipes, query, filterFav]);

  function handleSave(data: Omit<Recipe, 'id' | 'created_at' | 'family_id'>) {
    if (editing?.id) {
      updateRecipe(editing.id, data);
    } else {
      addRecipe({ ...data, created_by: activeMember?.id ?? null });
    }
    setEditing(null);
  }

  function handleImport(partial: Partial<Recipe>) {
    setShowImport(false);
    setEditing({ ...partial, icon: partial.title ? guessRecipeIcon(partial.title) : '🍽️' });
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="input pl-9 w-full"
          />
        </div>
        <button
          onClick={() => setFilterFav(!filterFav)}
          className={`btn-ghost flex items-center gap-1 text-sm ${filterFav ? 'text-red-500' : ''}`}
        >
          <Heart size={14} fill={filterFav ? 'currentColor' : 'none'} />
          Favourites
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="btn-ghost flex items-center gap-1 text-sm"
        >
          <Link size={14} />Import URL
        </button>
        <button
          onClick={() => setEditing({})}
          className="btn-primary flex items-center gap-1 text-sm"
        >
          <Plus size={14} />Add recipe
        </button>
      </div>

      {/* Recipe grid */}
      {recipes.length === 0 ? (
        <div className="card p-12 text-center text-text-faint">
          <div className="text-5xl mb-4">🍽️</div>
          <p className="font-medium text-text mb-1">No recipes yet</p>
          <p className="text-sm">Add your first recipe or import one from a URL.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-text-faint">
          <p>No recipes match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onEdit={() => setEditing(recipe)}
              onFavorite={() => toggleRecipeFavorite(recipe.id)}
            />
          ))}
        </div>
      )}

      {editing !== null && (
        <RecipeEditor
          recipe={editing}
          onSave={handleSave}
          onDelete={editing.id ? () => { deleteRecipe(editing.id!); setEditing(null); } : undefined}
          onClose={() => setEditing(null)}
        />
      )}

      {showImport && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

function RecipeCard({
  recipe,
  onEdit,
  onFavorite,
}: {
  recipe: Recipe;
  onEdit: () => void;
  onFavorite: () => void;
}) {
  const totalMin = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);

  return (
    <div
      className="card p-4 cursor-pointer hover:shadow-md transition group"
      onClick={onEdit}
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl">{recipe.icon || '🍽️'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-medium text-text leading-snug line-clamp-2">{recipe.title}</h3>
            <button
              onClick={(e) => { e.stopPropagation(); onFavorite(); }}
              className={`flex-shrink-0 mt-0.5 transition ${recipe.favorite ? 'text-red-500' : 'text-text-faint opacity-0 group-hover:opacity-100'}`}
            >
              <Heart size={15} fill={recipe.favorite ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-text-faint">
            {recipe.servings && <span>Serves {recipe.servings}</span>}
            {totalMin > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={11} />{totalMin} min
              </span>
            )}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 hover:text-accent"
              >
                <ExternalLink size={11} />{tryHostname(recipe.source_url)}
              </a>
            )}
          </div>
          {recipe.ingredients.length > 0 && (
            <p className="text-xs text-text-faint mt-1.5 line-clamp-1">
              {recipe.ingredients.slice(0, 4).map((i) => i.item).join(', ')}
              {recipe.ingredients.length > 4 && ` +${recipe.ingredients.length - 4}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
