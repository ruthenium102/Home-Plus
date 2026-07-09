// POST /api/import-recipe
// Tries schema.org/Recipe JSON-LD first (free, deterministic).
// Falls back to Claude AI for sites without structured data.

import { extractJsonLdRecipe, isCompleteRecipe } from './_lib/recipeExtractor.js';
import { extractWithClaude } from './_lib/claudeExtractor.js';
import { getCallerUser } from './_lib/supabaseAdmin.js';
import { assertSafeUrl, safeFetch, SsrfError } from './_lib/ssrfGuard.js';
import { applyCors } from './_lib/cors.js';

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Require a valid Supabase session — this endpoint fetches arbitrary URLs
  // server-side, so it must never be reachable anonymously.
  const user = await getCallerUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated' });

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ ok: false, error: "Missing 'url' in request body" });
    }

    // SSRF guard: reject loopback / RFC1918 / link-local / metadata hosts up
    // front (safeFetch re-validates again on every redirect hop).
    let parsedUrl;
    try {
      parsedUrl = await assertSafeUrl(url);
    } catch (err) {
      if (err instanceof SsrfError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
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
          ? 'This page only had partial recipe data, and AI extraction is not configured (the server is missing ANTHROPIC_API_KEY).'
          : "This page has no structured recipe data, and AI extraction is not configured (the server is missing ANTHROPIC_API_KEY). Try a recipe site like BBC Good Food.",
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
    const res = await safeFetch(url, {
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
    // SsrfError (internal redirect target), network error, or timeout.
    return null;
  }
}
