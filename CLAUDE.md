# Home Plus — project guide for Claude Code

Family organiser app (calendar, chores, habits, lists, rewards, kitchen, virtual pet).
Used by parents + kids on a shared device; child profiles are PIN-gated.

## Stack
- **Web:** React + TypeScript + Vite + Tailwind. SPA, tab/state-based nav (no react-router).
- **iOS:** Capacitor wrapper in `ios/` (WKWebView). Native builds are **Mac + Xcode only**.
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage). Edge function `send-invite`.
- **AI:** voice intake posts transcripts to `/api/voice-intake` → Anthropic.
- **Hosting:** Vercel. Prod URL: **https://home-plus-lyart.vercel.app** (note: `-lyart`).

## Commands
- `npm run dev` — local dev server
- `npm run build` — `tsc && vite build` (typecheck + build)
- `npm run lint` — eslint, zero warnings allowed
- `npm run ios` — build + `cap sync` + open Xcode (**Mac only; does NOT compile/run — Xcode does**)

## Deploy flow
- **Push to `main` → Vercel auto-deploys to prod.** No separate deploy step.
- **Bump `package.json` "version" on every deploy commit** (shown in the app footer, e.g. v1.0.82). This is a hard project rule.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch off `main` before committing if asked to commit; otherwise commit only when the user asks.

## Database / Supabase
- `supabase/schema.sql` is the **source of truth** for a fresh DB.
- Incremental changes go in `supabase/migrations/migrate_vN.sql` (idempotent) AND into `schema.sql`.
- Migrations are applied to the remote project by hand (SQL editor) or via the Supabase MCP.
  **Migrations through v28 are all applied.** (v23 = synced `position` columns for
  cross-device drag-reorder; v24 = pet achievements/lifetime stats/quest state; v25 = owner
  can always SELECT own family — fixed the RLS chicken-and-egg that silently broke
  first-family creation; v26 = `client_errors` write-only telemetry table; v27 = all
  membership/parent policies rewritten onto the `is_family_member()`/`is_family_parent()`
  helpers + `search_path` on the two linter-flagged trigger fns; v28 = meal_plans
  `recurrence` + `exdates` for rule-based repeating meals.)
- TS DB types are hand-written in `src/types/supabase.ts`, derived from `src/types/index.ts` —
  extend the interfaces in `index.ts` and the DB types follow.
- Hot DB facts: PIN hashes live in SECURITY-DEFINER-only `member_pins`; `reward_balances` is
  server-authoritative (reward RPCs only); pgcrypto definer fns need `set search_path = public, extensions`.

## Current state (July 2026, on `main` @ v1.0.118)
- **Release blockers:** all code-side blockers shipped. Remaining before App Store submission:
  the lawyer track (Privacy Policy `/privacy` + Terms `/terms` are **DRAFTS** with `[BRACKETED]`
  placeholders — see `reports/legal-handoff-2026-06-06.md`) and the iOS submission itself.
- **Virtual pet overhaul, phases 1–4 shipped:** fluid layered animation (v1.0.104) → Fluent 3D
  illustrated species, 12-animal roster (v1.0.105) → coin economy, shop & daily care streak
  (v1.0.107) → gameplay depth (v1.0.118): daily quests (3/day, deterministic per pet+date),
  19 achievements with coin bonuses, and a 4th `legend` growth stage (Lv 15+) with an
  evolution-celebration overlay. Gameplay files: `src/components/pet/petQuests.ts`,
  `petAchievements.ts`; event wiring via `applyPetEvents` in `FamilyContext`.
- **iOS polish pass (v1.0.108–117):** notch-safe layout, dense tab bar, sheet animations,
  swipe axis-lock, keep-alive tabs, chunk prefetch, overscroll colour via
  `WKWebView.underPageBackgroundColor`, Capacitor SPM pinned at 8.4.1, idempotent
  speech-recognition postinstall patch.
- **Legal (L1/L2/L4) code shipped (v1.0.82):** signup acceptance checkbox, per-child parental +
  voice consent, voice blocked for kids without consent.

## Conventions
- Match surrounding code style; keep comment density similar.
- Verify with `npm run build` (and `npm run lint`) before pushing.
