import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  /** Currently displayed emoji (may be the auto-guessed one). */
  value: string;
  onSelect: (emoji: string) => void;
}

interface EmojiDef {
  emoji: string;
  keywords: string;
}

interface EmojiGroup {
  category: string;
  emojis: EmojiDef[];
}

// Curated, food-forward emoji set for recipes. Each entry carries keywords so
// the search box can match on common names (e.g. "salmon" → 🐟).
const EMOJI_GROUPS: EmojiGroup[] = [
  {
    category: 'Mains',
    emojis: [
      { emoji: '🍽️', keywords: 'plate meal dinner generic' },
      { emoji: '🍝', keywords: 'pasta spaghetti noodles bolognese' },
      { emoji: '🍕', keywords: 'pizza' },
      { emoji: '🍔', keywords: 'burger hamburger' },
      { emoji: '🌭', keywords: 'hot dog sausage' },
      { emoji: '🥪', keywords: 'sandwich sub panini' },
      { emoji: '🌮', keywords: 'taco' },
      { emoji: '🌯', keywords: 'burrito wrap' },
      { emoji: '🫔', keywords: 'tamale' },
      { emoji: '🥙', keywords: 'kebab gyro pita falafel' },
      { emoji: '🧆', keywords: 'falafel meatball' },
      { emoji: '🍜', keywords: 'ramen noodle soup pho' },
      { emoji: '🍲', keywords: 'soup stew hotpot chowder' },
      { emoji: '🍛', keywords: 'curry rice tikka masala biryani' },
      { emoji: '🍚', keywords: 'rice risotto paella' },
      { emoji: '🍣', keywords: 'sushi roll' },
      { emoji: '🍱', keywords: 'bento lunchbox' },
      { emoji: '🥘', keywords: 'paella pan dish' },
      { emoji: '🫕', keywords: 'fondue cheese pot' },
      { emoji: '🥗', keywords: 'salad slaw greens veg' },
    ],
  },
  {
    category: 'Meat & seafood',
    emojis: [
      { emoji: '🥩', keywords: 'steak beef lamb chop brisket meat' },
      { emoji: '🍗', keywords: 'chicken drumstick poultry turkey' },
      { emoji: '🍖', keywords: 'meat bone pork rib' },
      { emoji: '🥓', keywords: 'bacon pork' },
      { emoji: '🐟', keywords: 'fish salmon tuna cod trout' },
      { emoji: '🐠', keywords: 'fish tropical' },
      { emoji: '🦐', keywords: 'shrimp prawn' },
      { emoji: '🦞', keywords: 'lobster' },
      { emoji: '🦀', keywords: 'crab' },
      { emoji: '🦑', keywords: 'squid calamari' },
      { emoji: '🐙', keywords: 'octopus' },
      { emoji: '🦪', keywords: 'oyster shellfish' },
      { emoji: '🥚', keywords: 'egg' },
      { emoji: '🍳', keywords: 'egg fried omelette frittata' },
      { emoji: '🧀', keywords: 'cheese mac' },
    ],
  },
  {
    category: 'Fruit & veg',
    emojis: [
      { emoji: '🥦', keywords: 'broccoli green veg vegetable' },
      { emoji: '🥬', keywords: 'lettuce greens leafy spinach kale veg' },
      { emoji: '🥕', keywords: 'carrot veg' },
      { emoji: '🌽', keywords: 'corn' },
      { emoji: '🍅', keywords: 'tomato' },
      { emoji: '🥔', keywords: 'potato' },
      { emoji: '🍠', keywords: 'sweet potato yam' },
      { emoji: '🧅', keywords: 'onion' },
      { emoji: '🧄', keywords: 'garlic' },
      { emoji: '🌶️', keywords: 'chilli pepper spicy' },
      { emoji: '🫑', keywords: 'pepper capsicum' },
      { emoji: '🍄', keywords: 'mushroom' },
      { emoji: '🥑', keywords: 'avocado' },
      { emoji: '🍆', keywords: 'eggplant aubergine' },
      { emoji: '🥒', keywords: 'cucumber pickle' },
      { emoji: '🫛', keywords: 'peas beans pod' },
      { emoji: '🍋', keywords: 'lemon citrus' },
      { emoji: '🍎', keywords: 'apple fruit' },
      { emoji: '🍌', keywords: 'banana fruit' },
      { emoji: '🍓', keywords: 'strawberry berry fruit' },
      { emoji: '🫐', keywords: 'blueberry berry fruit' },
      { emoji: '🍇', keywords: 'grapes fruit' },
      { emoji: '🍊', keywords: 'orange mandarin citrus' },
      { emoji: '🥥', keywords: 'coconut' },
    ],
  },
  {
    category: 'Breakfast & bakery',
    emojis: [
      { emoji: '🥞', keywords: 'pancake waffle' },
      { emoji: '🧇', keywords: 'waffle' },
      { emoji: '🥐', keywords: 'croissant pastry' },
      { emoji: '🥖', keywords: 'baguette bread' },
      { emoji: '🍞', keywords: 'bread loaf toast sourdough' },
      { emoji: '🥯', keywords: 'bagel' },
      { emoji: '🥨', keywords: 'pretzel' },
      { emoji: '🧈', keywords: 'butter' },
      { emoji: '🥣', keywords: 'cereal porridge oats bowl' },
      { emoji: '🍯', keywords: 'honey' },
    ],
  },
  {
    category: 'Desserts & sweets',
    emojis: [
      { emoji: '🍰', keywords: 'cake slice cheesecake' },
      { emoji: '🎂', keywords: 'cake birthday' },
      { emoji: '🧁', keywords: 'cupcake muffin' },
      { emoji: '🥧', keywords: 'pie tart' },
      { emoji: '🍪', keywords: 'cookie biscuit' },
      { emoji: '🍩', keywords: 'donut doughnut' },
      { emoji: '🍫', keywords: 'chocolate' },
      { emoji: '🍬', keywords: 'candy sweets' },
      { emoji: '🍮', keywords: 'custard pudding flan' },
      { emoji: '🍨', keywords: 'ice cream gelato' },
      { emoji: '🍦', keywords: 'ice cream soft serve' },
    ],
  },
  {
    category: 'Drinks',
    emojis: [
      { emoji: '☕', keywords: 'coffee tea hot' },
      { emoji: '🍵', keywords: 'tea matcha green' },
      { emoji: '🧃', keywords: 'juice box drink' },
      { emoji: '🥤', keywords: 'soda drink cup' },
      { emoji: '🧋', keywords: 'bubble tea boba' },
      { emoji: '🥛', keywords: 'milk' },
      { emoji: '🍷', keywords: 'wine' },
      { emoji: '🍺', keywords: 'beer' },
      { emoji: '🍹', keywords: 'cocktail mocktail' },
      { emoji: '🥂', keywords: 'champagne celebrate' },
      { emoji: '🧉', keywords: 'mate drink' },
      { emoji: '🍶', keywords: 'sake' },
    ],
  },
  {
    category: 'Other',
    emojis: [
      { emoji: '🍿', keywords: 'popcorn snack' },
      { emoji: '🧂', keywords: 'salt seasoning' },
      { emoji: '🌿', keywords: 'herbs basil mint' },
      { emoji: '🫙', keywords: 'jar preserve' },
      { emoji: '🥫', keywords: 'can tin' },
      { emoji: '🍢', keywords: 'skewer oden' },
      { emoji: '🍡', keywords: 'dango dumpling' },
      { emoji: '🥟', keywords: 'dumpling gyoza' },
      { emoji: '🫓', keywords: 'flatbread naan' },
      { emoji: '👨‍🍳', keywords: 'chef cook' },
      { emoji: '🔥', keywords: 'grill bbq spicy' },
      { emoji: '⭐', keywords: 'favourite star special' },
    ],
  },
];

export function EmojiPicker({ value, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_GROUPS;
    const matches = EMOJI_GROUPS.flatMap((g) => g.emojis).filter(
      (e) => e.keywords.includes(q) || e.emoji === q,
    );
    return matches.length ? [{ category: 'Results', emojis: matches }] : [];
  }, [query]);

  function pick(emoji: string) {
    onSelect(emoji);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-3xl w-12 h-12 rounded-lg bg-surface-2 flex items-center justify-center hover:bg-surface-3 transition"
        title="Choose an icon"
      >
        {value}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-20 w-72 card p-3 shadow-lg border border-border">
          <div className="relative mb-2">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons…"
              className="w-full pl-8 pr-8 py-1.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-text-faint hover:text-text"
                title="Clear"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto pr-1 -mr-1">
            {groups.length === 0 ? (
              <div className="text-xs text-text-faint text-center py-6">
                No icons match “{query}”.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.category} className="mb-3 last:mb-0">
                  <div className="text-[11px] uppercase tracking-wider text-text-faint px-0.5 mb-1">
                    {group.category}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {group.emojis.map((e) => (
                      <button
                        key={e.emoji}
                        type="button"
                        onClick={() => pick(e.emoji)}
                        title={e.keywords.split(' ')[0]}
                        className={
                          'aspect-square text-xl rounded-md flex items-center justify-center transition-colors ' +
                          (value === e.emoji ? 'bg-accent-soft' : 'hover:bg-surface-2')
                        }
                      >
                        {e.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
