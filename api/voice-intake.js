/**
 * POST /api/voice-intake
 * Auth: Authorization: Bearer <supabase session token> (required)
 * Body: {
 *   transcript: string,
 *   family_id: uuid,
 *   active_member_id?: uuid   // the PIN-selected profile on the tablet
 * }
 *
 * The family context (members / lists / habits / chores / timezone) is fetched
 * server-side from the caller's family — we never trust a client-supplied
 * context payload, so a member can't smuggle in another family's ids.
 *
 * Returns: { action: { kind, ...payload } }
 *
 * Kinds Claude can return:
 *   add_list_item   { list_id, title, due_date?, assigned_to? }
 *   add_event       { title, start_at, end_at, all_day, member_ids, category, location?, description? }
 *   log_habit       { habit_id, for_date }
 *   set_status      { member_id, location, until? }
 *   add_chore       { title, assigned_to[], frequency, weekdays }
 *   unknown         { reason }
 *
 * Requires ANTHROPIC_API_KEY. Without it, falls back to a tiny heuristic that
 * only handles "add X to <list>" so the demo still feels alive.
 */
import { getCallerUser, getSupabaseAdmin, getFamilyMember } from './_lib/supabaseAdmin.js';
import { checkRateLimit } from './_lib/rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require a valid Supabase session and family membership before spending any
  // Anthropic credit.
  const user = await getCallerUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { transcript, family_id, active_member_id } = req.body || {};
  if (typeof transcript !== 'string' || transcript.trim().length === 0) {
    return res.status(400).json({ error: 'Missing transcript' });
  }
  if (transcript.length > 1000) {
    return res.status(400).json({ error: 'Transcript too long' });
  }
  if (!family_id || typeof family_id !== 'string') {
    return res.status(400).json({ error: 'family_id is required' });
  }

  const admin = getSupabaseAdmin();
  const member = await getFamilyMember(admin, user.id, family_id);
  if (!member) return res.status(403).json({ error: 'Not a member of this family' });

  // Per-user rate limit (best-effort, per-instance — see rateLimit.js).
  const rl = await checkRateLimit(`voice:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
  }

  // Child voice-consent gate — enforced SERVER-SIDE (the matching check in
  // useVoiceIntake is only UX). A child profile's transcript must never reach
  // the AI provider unless a parent has recorded voice consent, regardless of
  // what client sent the request.
  if (active_member_id && typeof active_member_id === 'string') {
    const { data: activeMember } = await admin
      .from('family_members')
      .select('role, voice_consent_at')
      .eq('id', active_member_id)
      .eq('family_id', family_id)
      .maybeSingle();
    if (!activeMember) {
      return res.status(400).json({ error: 'Unknown active_member_id' });
    }
    if (activeMember.role === 'child' && !activeMember.voice_consent_at) {
      return res.status(403).json({ error: 'Voice is not enabled for this profile' });
    }
  }

  // Build the family context server-side from the DB. Never trust a
  // client-supplied context — that's how a member could reference another
  // family's list/habit ids.
  const context = await loadFamilyContext(admin, family_id, active_member_id);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No AI configured. The tiny heuristic still handles "add X to <list>" so
    // the demo feels alive; for anything it can't parse, return a clear,
    // specific error (503) instead of a vague "unknown" so the user knows AI
    // voice isn't set up rather than thinking we just misheard them.
    const fallback = heuristicFallback(transcript, context);
    if (fallback.kind !== 'unknown') {
      return res.status(200).json({ action: fallback });
    }
    return res.status(503).json({
      error: 'Voice commands are not configured. The server is missing ANTHROPIC_API_KEY.',
    });
  }

  const systemPrompt = buildSystemPrompt(context);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: transcript }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Anthropic API error:', response.status, detail);
      return res.status(502).json({ error: 'Upstream AI request failed' });
    }

    const data = await response.json();
    const textBlock = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(200).json({
        action: { kind: 'unknown', reason: 'No JSON in AI response' },
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return res.status(200).json({
        action: { kind: 'unknown', reason: 'AI response was not valid JSON' },
      });
    }

    return res.status(200).json({ action: parsed });
  } catch (err) {
    console.error('voice-intake error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Fetch the family's members / lists / habits / chores / timezone server-side
// so the model prompt is built from trusted data, not the client payload.
async function loadFamilyContext(admin, familyId, activeMemberId) {
  const [familyRes, membersRes, listsRes, habitsRes, choresRes] = await Promise.all([
    admin.from('families').select('timezone').eq('id', familyId).maybeSingle(),
    admin.from('family_members').select('id, name, role').eq('family_id', familyId),
    admin
      .from('todo_lists')
      .select('id, name, owner_id')
      .eq('family_id', familyId)
      .eq('archived', false),
    admin
      .from('habits')
      .select('id, title, member_id')
      .eq('family_id', familyId)
      .eq('archived', false),
    admin
      .from('chores')
      .select('id, title')
      .eq('family_id', familyId)
      .eq('archived', false),
  ]);

  const members = membersRes.data || [];
  const active = activeMemberId ? members.find((m) => m.id === activeMemberId) : null;

  return {
    now: new Date().toISOString(),
    timezone: familyRes.data?.timezone || 'UTC',
    active_member: active ? { id: active.id, name: active.name, role: active.role } : null,
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    lists: listsRes.data || [],
    habits: habitsRes.data || [],
    chores: choresRes.data || [],
  };
}

function buildSystemPrompt(ctx) {
  const members = (ctx.members || [])
    .map((m) => `- ${m.id}: ${m.name} (${m.role})`)
    .join('\n');
  const lists = (ctx.lists || [])
    .map(
      (l) =>
        `- ${l.id}: ${l.name}${l.owner_id ? ` (private to ${l.owner_id})` : ' (shared)'}`,
    )
    .join('\n');
  const habits = (ctx.habits || [])
    .map((h) => `- ${h.id}: "${h.title}" (member ${h.member_id})`)
    .join('\n');
  const chores = (ctx.chores || [])
    .map((c) => `- ${c.id}: "${c.title}"`)
    .join('\n');

  return `You are the voice-command parser for "Home Plus", a family operating system app running on a kitchen tablet. The active user speaks a short command. Your job: output ONE structured action as strict JSON.

Now: ${ctx.now}
Timezone: ${ctx.timezone}
Active user: ${ctx.active_member?.id} (${ctx.active_member?.name}, ${ctx.active_member?.role})

Family members:
${members || '(none)'}

Lists (use these ids verbatim):
${lists || '(none)'}

Habits (use these ids verbatim):
${habits || '(none)'}

Chores (existing — use ids if user references one):
${chores || '(none)'}

Available action kinds:

1. add_list_item — "add eggs to the shopping list", "put pick up Henry on the family list"
   { "kind": "add_list_item", "list_id": "<id>", "title": "Eggs", "due_date": null, "assigned_to": null }

2. add_event — "Henry has soccer Thursday at 5pm", "dentist next Tuesday 9am"
   Categories: general | school | work | sport | medical | social | travel | meal | wfh
   Use ISO datetimes in the family timezone (omit the Z, e.g. "2026-05-30T17:00:00").
   { "kind": "add_event", "title": "Soccer", "start_at": "...", "end_at": "...", "all_day": false, "member_ids": ["<id>"], "category": "sport", "location": null, "description": null }

3. log_habit — "log my reading", "tick reading for Sophie"
   Default to today for for_date and active user's habit unless another member is named.
   { "kind": "log_habit", "habit_id": "<id>", "for_date": "2026-05-28" }

4. set_status — "I'm at work", "Susan is away til Sunday", "Henry's at school"
   Common locations: Home, School, Work, Out, Away.
   { "kind": "set_status", "member_id": "<id>", "location": "Work", "until": null }

5. add_chore — "add a new chore for Laura to feed the dog daily" (parents only)
   Frequencies: daily | weekly | weekdays | weekend | monthly | one_off
   { "kind": "add_chore", "title": "Feed the dog", "assigned_to": ["<id>"], "frequency": "daily", "weekdays": [] }

6. unknown — if you can't confidently map the command, or the active user is a child trying to add a chore.
   { "kind": "unknown", "reason": "short user-facing explanation" }

Rules:
- Return ONLY the JSON object — no markdown, no commentary.
- Use the ids verbatim from the lists above. Never invent ids.
- If the user doesn't name a member, default to the active user.
- For dates, prefer the soonest future occurrence ("Thursday" → next Thursday if past).
- If a command would touch a list that doesn't exist, return unknown with a helpful reason.`;
}

// Demo-mode fallback. Only handles the most common pattern.
function heuristicFallback(transcript, ctx) {
  const t = transcript.trim();
  const m = t.match(/^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the\s+|my\s+)?(.+?)(?:\s+list)?\.?\s*$/i);
  if (m && ctx.lists?.length) {
    const item = m[1].trim();
    const listName = m[2].trim().toLowerCase();
    const match = ctx.lists.find((l) => l.name.toLowerCase().includes(listName));
    if (match) {
      return {
        kind: 'add_list_item',
        list_id: match.id,
        title: capitalise(item),
        due_date: null,
        assigned_to: null,
      };
    }
  }
  return {
    kind: 'unknown',
    reason: 'Voice routing needs ANTHROPIC_API_KEY in Vercel. Demo only handles "add X to <list>".',
  };
}

function capitalise(s) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
