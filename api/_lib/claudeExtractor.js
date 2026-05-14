// Claude AI fallback for recipe extraction.
// Used when JSON-LD parsing fails or returns incomplete data.

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

const RECIPE_TOOL = {
  name: 'save_recipe',
  description: 'Save the extracted recipe data',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      servings: { type: ['integer', 'null'] },
      prepMinutes: { type: ['integer', 'null'] },
      cookMinutes: { type: ['integer', 'null'] },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            quantity: { type: ['number', 'null'] },
            unit: { type: 'string', description: "e.g. 'g', 'cups', 'tsp', or empty string" },
            item: { type: 'string', description: "The food item itself, e.g. 'flour'" },
          },
          required: ['quantity', 'unit', 'item'],
        },
      },
      steps: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'ingredients', 'steps'],
  },
};

const SYSTEM_PROMPT =
  'You extract recipes from web pages. Return ONLY structured data via the save_recipe tool. ' +
  'For ingredients: split each into quantity (number or null), unit, and item (the food itself). ' +
  'CRITICAL UNIT RULES: When BOTH metric and imperial measurements appear for the same ingredient ' +
  "(e.g. '50g (1¾oz)', '1¾oz/50g', '400g (14oz)'), ALWAYS use the metric measurement (g, kg, ml, L) " +
  'and discard the imperial equivalent. ' +
  'If only one system is given, use it as-is. NEVER convert between unit categories. ' +
  "If the recipe says '1 tbsp olive oil' output quantity=1, unit='tbsp', item='olive oil'. " +
  'If no unit is stated, leave the unit field as an empty string. ' +
  "Recognize 'gm', 'gms', 'grm' as grams — output 'g'. " +
  "For whole items like '2 eggs', leave unit empty and put 'eggs' in item. " +
  'If quantity is a fraction like 1/2, convert to decimal (0.5). ' +
  'Ignore navigation, ads, comments, and unrelated content.';

const WEIGHT_UNITS = new Set(['g', 'kg', 'oz', 'lb']);
const TYPICALLY_LIQUID = ['milk', 'cream', 'water', 'oil', 'stock', 'broth', 'juice', 'wine', 'vinegar', 'sauce'];

function postProcessIngredient(ing) {
  let { quantity, unit, item } = ing;
  unit = (unit || '').trim().toLowerCase();
  item = (item || '').trim();

  const aliasMap = {
    'gm': 'g', 'gms': 'g', 'grm': 'g', 'gram': 'g', 'grams': 'g',
    'kgs': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
    'tablespoon': 'tbsp', 'tablespoons': 'tbsp',
    'teaspoon': 'tsp', 'teaspoons': 'tsp',
    'litre': 'l', 'litres': 'l', 'liter': 'l', 'liters': 'l',
    'ounce': 'oz', 'ounces': 'oz',
    'pound': 'lb', 'pounds': 'lb', 'lbs': 'lb',
  };
  if (aliasMap[unit]) unit = aliasMap[unit];

  // Detect suspicious volume→weight conversions
  if (WEIGHT_UNITS.has(unit) && quantity != null) {
    const itemLower = item.toLowerCase();
    const isLiquid = TYPICALLY_LIQUID.some((k) => itemLower.includes(k));
    if (isLiquid && quantity % 1 !== 0 && quantity < 100) {
      quantity = null;
      unit = '';
    }
  }

  return { quantity, unit, item };
}

export async function extractWithClaude(html, sourceUrl, apiKey) {
  const text = htmlToText(html).slice(0, 30_000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [RECIPE_TOOL],
        tool_choice: { type: 'tool', name: 'save_recipe' },
        messages: [{ role: 'user', content: `Extract the recipe from this web page (source: ${sourceUrl}).\n\n${text}` }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const toolUse = data.content?.find((c) => c.type === 'tool_use');
    if (!toolUse) return null;

    const extracted = toolUse.input;
    return {
      title: extracted.title || 'Untitled Recipe',
      servings: extracted.servings ?? null,
      prepMinutes: extracted.prepMinutes ?? null,
      cookMinutes: extracted.cookMinutes ?? null,
      ingredients: (extracted.ingredients || []).map(postProcessIngredient),
      steps: extracted.steps || [],
      sourceUrl,
    };
  } catch {
    return null;
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
