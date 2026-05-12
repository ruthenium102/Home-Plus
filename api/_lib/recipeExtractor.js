// JSON-LD parsing for schema.org/Recipe.

export function extractJsonLdRecipe(html, sourceUrl) {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = [...html.matchAll(scriptRegex)];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const recipe = findRecipeInJsonLd(parsed);
      if (recipe) return normalizeJsonLdRecipe(recipe, sourceUrl);
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return null;
}

function findRecipeInJsonLd(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) { const found = findRecipeInJsonLd(item); if (found) return found; }
    return null;
  }
  if (typeof node === 'object') {
    const type = node['@type'];
    if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
    if (node['@graph']) return findRecipeInJsonLd(node['@graph']);
    for (const key of ['mainEntity', 'mainEntityOfPage', 'itemListElement']) {
      if (node[key]) { const found = findRecipeInJsonLd(node[key]); if (found) return found; }
    }
  }
  return null;
}

function normalizeJsonLdRecipe(raw, sourceUrl) {
  return {
    title: String(raw.name || 'Untitled Recipe').trim(),
    servings: parseServings(raw.recipeYield),
    prepMinutes: parseDuration(raw.prepTime),
    cookMinutes: parseDuration(raw.cookTime),
    ingredients: toStringArray(raw.recipeIngredient).map(parseIngredientString),
    steps: parseInstructions(raw.recipeInstructions),
    sourceUrl,
  };
}

function parseServings(val) {
  if (typeof val === 'number') return Math.round(val);
  if (Array.isArray(val) && val[0] != null) return parseServings(val[0]);
  if (typeof val === 'string') { const m = val.match(/\d+/); return m ? parseInt(m[0], 10) : null; }
  return null;
}

function parseDuration(val) {
  if (typeof val !== 'string') return null;
  const m = val.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!m) return null;
  const total = (m[1] ? parseInt(m[1], 10) : 0) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  return total > 0 ? total : null;
}

function toStringArray(val) {
  if (Array.isArray(val)) return val.map((v) => typeof v === 'string' ? v : String(v ?? '')).filter(Boolean);
  if (typeof val === 'string') return [val];
  return [];
}

function parseInstructions(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.flatMap(parseInstructions);
  if (typeof val === 'string') return val.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (typeof val === 'object') {
    if (val['@type'] === 'HowToStep' && typeof val.text === 'string') return [val.text.trim()];
    if (val['@type'] === 'HowToSection' && val.itemListElement) return parseInstructions(val.itemListElement);
    if (typeof val.text === 'string') return [val.text.trim()];
  }
  return [];
}

const KNOWN_UNITS = new Set([
  'cup', 'cups', 'tsp', 'tsps', 'teaspoon', 'teaspoons',
  'tbsp', 'tbsps', 'tablespoon', 'tablespoons',
  'g', 'gm', 'gms', 'grm', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
  'ml', 'l', 'liter', 'liters', 'litre', 'litres',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'pinch', 'pinches', 'dash', 'dashes', 'clove', 'cloves',
  'stick', 'sticks', 'can', 'cans', 'jar', 'jars',
]);

const FRACTION_MAP = { '½': 0.5, '⅓': 1/3, '⅔': 2/3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

export function parseIngredientString(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { quantity: null, unit: '', item: '' };

  const numericPattern = /^(\d+\s+\d+\/\d+|\d+\/\d+|[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:[.,]\d+)?)\s*/;
  const numMatch = trimmed.match(numericPattern);
  let quantity = null;
  let rest = trimmed;

  if (numMatch) {
    const numStr = numMatch[1];
    if (FRACTION_MAP[numStr]) {
      quantity = FRACTION_MAP[numStr];
    } else if (numStr.includes(' ')) {
      const [whole, frac] = numStr.split(/\s+/);
      const [n, d] = frac.split('/').map(Number);
      quantity = parseFloat(whole) + n / d;
    } else if (numStr.includes('/')) {
      const [n, d] = numStr.split('/').map(Number);
      quantity = n / d;
    } else {
      quantity = parseFloat(numStr.replace(',', '.'));
    }
    rest = trimmed.slice(numMatch[0].length).trim();
  }

  let unit = '';
  let item = rest;
  const unitMatch = rest.match(/^([a-zA-Z]+)\b\s*(.*)$/);
  if (unitMatch && KNOWN_UNITS.has(unitMatch[1].toLowerCase())) {
    unit = unitMatch[1].toLowerCase();
    item = unitMatch[2].trim();
  }

  if (!unit && quantity != null) {
    const stuckUnit = rest.match(/^(g|gm|gms|grm|kg|ml|l|oz|lb|lbs)\b\s*(.*)$/i);
    if (stuckUnit) { unit = stuckUnit[1].toLowerCase(); item = stuckUnit[2].trim(); }
  }

  const aliases = { 'gm': 'g', 'gms': 'g', 'grm': 'g', 'gram': 'g', 'grams': 'g', 'kgs': 'kg', 'kilogram': 'kg', 'kilograms': 'kg', 'lbs': 'lb', 'pound': 'lb', 'pounds': 'lb', 'ounce': 'oz', 'ounces': 'oz', 'liter': 'l', 'liters': 'l', 'litre': 'l', 'litres': 'l', 'teaspoon': 'tsp', 'teaspoons': 'tsp', 'tablespoon': 'tbsp', 'tablespoons': 'tbsp' };
  if (aliases[unit]) unit = aliases[unit];

  return { quantity, unit, item: item || rest };
}

export function isCompleteRecipe(r) {
  return r && r.title && r.title.length > 0 && r.ingredients?.length > 0 && r.steps?.length > 0;
}
