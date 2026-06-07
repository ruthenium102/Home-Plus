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
  **As of v1.0.82, migrations through v20 are all applied.** (v20 added legal-consent columns.)
- TS DB types are hand-written in `src/types/supabase.ts`, derived from `src/types/index.ts` —
  extend the interfaces in `index.ts` and the DB types follow.
- Hot DB facts: PIN hashes live in SECURITY-DEFINER-only `member_pins`; `reward_balances` is
  server-authoritative (reward RPCs only); pgcrypto definer fns need `set search_path = public, extensions`.

## Current state (June 2026, on `main` @ v1.0.82)
Recently shipped to prod:
- **Legal (L1/L2/L4):** Privacy Policy `/privacy` + Terms `/terms` (static `public/*.html`), signup
  acceptance checkbox, per-child parental + voice consent, voice blocked for kids without consent.
  **The policy/ToS are DRAFTS** — see `reports/legal-handoff-2026-06-06.md` for the lawyer-track
  items + `[BRACKETED]` placeholders that must be filled before App Store submission.
- **Habit streak fix:** streaks now respect the daily target (`count > 0 && targetMet`) in
  `src/lib/habits.ts` — over-cap / under-goal days break the streak.
- **Drag-to-reorder:** drag now initiates from the grip handle (`DragHandle` + `useListDragReorder`),
  with `select-none` rows, handle `stopPropagation` so `SwipeableRow` doesn't fight it, and a
  visible `DropIndicator` insertion line (the old box-shadow line was clipped by `overflow-hidden`).

## Conventions
- Match surrounding code style; keep comment density similar.
- Verify with `npm run build` (and `npm run lint`) before pushing.
