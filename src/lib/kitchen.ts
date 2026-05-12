import type { MealType } from '@/types';

export function guessRecipeIcon(title: string): string {
  if (!title) return '🍽️';
  const t = title.toLowerCase();
  const map: [string[], string][] = [
    [['pasta', 'spaghetti', 'linguine', 'fettuccine', 'carbonara', 'bolognese', 'lasagna', 'lasagne', 'noodle'], '🍝'],
    [['pizza'], '🍕'],
    [['burger'], '🍔'],
    [['taco'], '🌮'],
    [['burrito', 'wrap'], '🌯'],
    [['sushi', 'roll'], '🍣'],
    [['ramen', 'pho'], '🍜'],
    [['salad', 'slaw'], '🥗'],
    [['soup', 'stew', 'chowder', 'broth'], '🍲'],
    [['curry', 'tikka', 'masala', 'biryani', 'dal', 'daal'], '🍛'],
    [['rice', 'risotto', 'paella', 'pilaf'], '🍚'],
    [['steak', 'beef', 'brisket'], '🥩'],
    [['chicken', 'poultry', 'turkey'], '🍗'],
    [['fish', 'salmon', 'tuna', 'cod', 'trout', 'snapper'], '🐟'],
    [['shrimp', 'prawn', 'lobster', 'crab'], '🦐'],
    [['egg', 'omelet', 'omelette', 'frittata', 'shakshuka'], '🍳'],
    [['pancake', 'waffle', 'french toast', 'crepe'], '🥞'],
    [['bread', 'loaf', 'sourdough', 'baguette', 'focaccia'], '🍞'],
    [['sandwich', 'panini', 'sub'], '🥪'],
    [['cake', 'cupcake', 'cheesecake'], '🍰'],
    [['cookie', 'biscuit', 'shortbread'], '🍪'],
    [['pie', 'tart', 'crumble', 'cobbler'], '🥧'],
    [['ice cream', 'gelato', 'sorbet'], '🍨'],
    [['chocolate', 'brownie', 'ganache'], '🍫'],
    [['donut', 'doughnut'], '🍩'],
    [['dumpling', 'gyoza', 'wonton', 'bao'], '🥟'],
    [['stir fry', 'stirfry', 'stir-fry', 'wok'], '🥡'],
    [['bbq', 'barbecue', 'grill'], '🔥'],
    [['breakfast', 'brunch'], '🍳'],
    [['vegetable', 'veggie', 'roasted veg'], '🥦'],
    [['potato', 'fries', 'mash'], '🥔'],
    [['avocado', 'guacamole'], '🥑'],
    [['smoothie', 'shake'], '🥤'],
  ];
  for (const [keywords, icon] of map) {
    if (keywords.some((k) => t.includes(k))) return icon;
  }
  return '🍽️';
}

const DESCRIPTORS = new Set([
  'large', 'small', 'medium', 'big', 'jumbo', 'mini', 'tiny', 'extra-large', 'xl',
  'fresh', 'frozen', 'dried', 'canned', 'tinned', 'organic', 'free-range', 'free', 'range',
  'wild', 'wild-caught', 'farm-raised', 'grass-fed', 'pasture-raised',
  'chopped', 'diced', 'sliced', 'minced', 'grated', 'shredded', 'cubed', 'crushed',
  'ground', 'whole', 'halved', 'quartered', 'peeled', 'cooked', 'raw',
  'finely', 'roughly', 'thinly', 'thickly', 'coarsely',
  'red', 'green', 'yellow', 'white', 'brown',
  'low-fat', 'reduced-fat', 'full-fat', 'fat-free', 'lean', 'unsalted', 'salted',
  'softened', 'melted', 'room-temperature', 'cold', 'hot', 'warm',
  'plain', 'natural', 'unsweetened', 'sweetened',
]);

export function cleanIngredientName(item: string): string {
  if (!item) return '';
  let s = item.split(',')[0].trim().toLowerCase();
  s = s.replace(/\([^)]*\)/g, '').trim();
  const words = s.split(/\s+/).filter((w) => w && !DESCRIPTORS.has(w));
  return words.join(' ').trim() || s;
}

export function displayIngredient(cleanName: string): string {
  if (!cleanName) return '';
  return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
}

export function normalizeItem(s: string): string {
  return (s || '').toLowerCase().trim().replace(/s$/, '');
}

export function formatQty(q: number): string {
  if (q === Math.floor(q)) return String(q);
  return q.toFixed(2).replace(/\.?0+$/, '');
}

export function guessIngredientIcon(cleanName: string): string {
  if (!cleanName) return '';
  const words = cleanName.toLowerCase().split(/\s+/);
  const has = (w: string) =>
    words.includes(w) || words.includes(w + 's') || words.includes(w + 'es');
  const map: [() => boolean, string][] = [
    [() => has('chicken') || has('turkey') || has('duck'), '🍗'],
    [() => has('beef') || has('steak') || has('mince') || has('mincemeat'), '🥩'],
    [() => has('pork') || has('bacon') || has('ham') || has('sausage'), '🥓'],
    [() => has('salmon') || has('tuna') || has('cod') || has('fish'), '🐟'],
    [() => has('shrimp') || has('prawn'), '🦐'],
    [() => has('egg'), '🥚'],
    [() => has('milk') || has('cream') || has('butter') || has('cheese') || has('yogurt') || has('yoghurt'), '🧀'],
    [() => has('flour'), '🌾'],
    [() => has('sugar'), '🍬'],
    [() => has('salt'), '🧂'],
    [() => has('oil') || has('olive'), '🫒'],
    [() => has('tomato'), '🍅'],
    [() => has('onion') || has('shallot'), '🧅'],
    [() => has('garlic'), '🧄'],
    [() => has('potato'), '🥔'],
    [() => has('carrot'), '🥕'],
    [() => has('pepper') || has('capsicum'), '🫑'],
    [() => has('lemon') || has('lime'), '🍋'],
    [() => has('apple'), '🍎'],
    [() => has('avocado'), '🥑'],
    [() => has('mushroom'), '🍄'],
    [() => has('broccoli'), '🥦'],
    [() => has('spinach') || has('lettuce') || has('kale'), '🥬'],
    [() => has('rice'), '🍚'],
    [() => has('pasta') || has('noodle'), '🍝'],
    [() => has('bread'), '🍞'],
    [() => has('bean') || has('lentil') || has('chickpea'), '🫘'],
    [() => has('herb') || has('basil') || has('parsley') || has('coriander') || has('thyme') || has('rosemary'), '🌿'],
    [() => has('ginger'), '🫚'],
    [() => has('stock') || has('broth'), '🍲'],
  ];
  for (const [test, icon] of map) {
    if (test()) return icon;
  }
  return '';
}

export function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split('T')[0];
}

export function tryHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const MEAL_TIMES: Record<MealType, { start: string; end: string }> = {
  breakfast: { start: '08:00', end: '09:00' },
  lunch:     { start: '12:30', end: '13:30' },
  dinner:    { start: '18:30', end: '20:00' },
  snack:     { start: '15:00', end: '15:30' },
};

export function mealTypeTime(type: MealType) {
  return MEAL_TIMES[type] ?? MEAL_TIMES.dinner;
}

export function mealTypeLabel(type: MealType): string {
  return { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }[type];
}
