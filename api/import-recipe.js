// POST /api/import-recipe
// Tries schema.org/Recipe JSON-LD first (free, deterministic).
// Falls back to Claude AI for sites without structured data.

import { extractJsonLdRecipe, isCompleteRecipe } from './_lib/recipeExtractor.js';
import { extractWithClaude } from './_lib/claudeExtractor.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ ok: false, error: "Missing 'url' in request body" });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid URL' });
    }

    const html = await fetchPage(parsedUrl.toString());
    if (!html) return res.status(502).json({ ok: false, error: 'Could not fetch the URL' });

    const jsonLdRecipe = extractJsonLdRecipe(html, parsedUrl.toString());
    if (jsonLdRecipe && isCompleteRecipe(jsonLdRecipe)) {
      return res.status(200).json({ ok: true, recipe: normalizeForApp(jsonLdRecipe) });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(422).json({
        ok: false,
        error: jsonLdRecipe
          ? 'Found partial recipe data but it was incomplete. Set ANTHROPIC_API_KEY to enable AI fallback.'
          : 'No structured recipe data on this page. Set ANTHROPIC_API_KEY to enable AI extraction.',
      });
    }

    const aiRecipe = await extractWithClaude(html, parsedUrl.toString(), process.env.ANTHROPIC_API_KEY);
    if (aiRecipe) return res.status(200).json({ ok: true, recipe: normalizeForApp(aiRecipe) });

    return res.status(422).json({ ok: false, error: 'Could not extract a recipe from this URL' });
  } catch (err) {
    console.error('[import-recipe] error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Unknown error' });
  }
}

// Map Kitchen Plus field names → Home Plus field names
function normalizeForApp(recipe) {
  return {
    title: recipe.title,
    servings: recipe.servings ?? 4,
    prep_minutes: recipe.prepMinutes ?? null,
    cook_minutes: recipe.cookMinutes ?? null,
    ingredients: (recipe.ingredients || []).map((i) => ({
      quantity: i.quantity ?? null,
      unit: i.unit || '',
      item: i.item || '',
    })),
    steps: recipe.steps || [],
    notes: null,
    source_url: recipe.sourceUrl || null,
  };
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
