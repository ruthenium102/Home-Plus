/**
 * POST /api/extract-events
 * Body: { text: string }
 * Returns: { events: Array<{ title, start_at, end_at, all_day, ... }> }
 *
 * Requires the ANTHROPIC_API_KEY env var to be set in Vercel
 * (Settings → Environment Variables).
 *
 * If the env var isn't set, returns 501 — the frontend falls back to its
 * regex-based extractor.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error:
        'Server-side AI extraction is not configured. Set ANTHROPIC_API_KEY in Vercel environment variables.'
    });
  }

  const { text } = req.body || {};
  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or empty `text` field' });
  }

  if (text.length > 20000) {
    return res
      .status(400)
      .json({ error: 'Text too long. Limit is 20,000 characters.' });
  }

  // Use a current Claude model. Haiku 4.5 is fast + cheap for this task.
  const todayISO = new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are an event extraction tool. Given raw text (a school newsletter, an email, a flyer, etc.), find every concrete event with a date and return them as JSON.

Today's date is ${todayISO}. If a year is missing, infer the most likely year (usually current or next).

Return ONLY a JSON object of this exact shape (no markdown, no commentary):
{
  "events": [
    {
      "title": "string",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM" | null,
      "end_time": "HH:MM" | null,
      "location": "string" | null,
      "description": "string" | null,
      "category": "general" | "school" | "work" | "sport" | "medical" | "social" | "travel" | "meal"
    }
  ]
}

Rules:
- If no clear date, skip the event.
- If the text mentions a date range (e.g. "school holidays 24 Dec - 28 Jan"), output two events: one for start, one for end.
- title should be concise — strip "Reminder:", "Important:", etc.
- If no events found, return { "events": [] }.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Anthropic API error:', response.status, detail);
      return res
        .status(502)
        .json({ error: 'Upstream AI request failed', status: response.status });
    }

    const data = await response.json();
    const textBlock = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    // Extract the JSON — model may wrap in ```json``` fences despite instructions
    const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'AI returned no parseable JSON' });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      return res.status(502).json({ error: 'AI response was not valid JSON' });
    }

    const events = Array.isArray(parsed.events) ? parsed.events : [];

    // Normalise into the ImportableEvent shape the frontend expects
    const normalized = events
      .filter((e) => e && typeof e.title === 'string' && typeof e.date === 'string')
      .map((e) => {
        const allDay = !e.start_time;
        const startISO = allDay
          ? e.date + 'T00:00:00.000Z'
          : e.date + 'T' + e.start_time + ':00.000Z';
        const endISO = allDay
          ? e.date + 'T23:59:00.000Z'
          : e.end_time
            ? e.date + 'T' + e.end_time + ':00.000Z'
            : startISO;

        const validCategories = [
          'general',
          'school',
          'work',
          'sport',
          'medical',
          'social',
          'travel',
          'meal'
        ];
        const category = validCategories.includes(e.category)
          ? e.category
          : 'general';

        return {
          source_id: 'paste-' + e.date + '-' + String(e.title).slice(0, 24),
          title: String(e.title).trim(),
          start_at: startISO,
          end_at: endISO,
          all_day: allDay,
          description: e.description ? String(e.description) : null,
          location: e.location ? String(e.location) : null,
          category
        };
      });

    return res.status(200).json({ events: normalized });
  } catch (err) {
    console.error('extract-events error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
