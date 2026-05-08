# Home Plus

A family operating system for the kitchen tablet — calendar, chores, rewards, lists, habits, location status, and (soon) the full Kitchen Plus app.

This is **v4**. Phases 1, 2, 3 plus the v4 polish pass are complete.

---

## Quick start

```bash
npm install
npm run dev
```

The app runs at <http://localhost:5173>.

It runs in **demo mode** out of the box — no Supabase needed. Demo data is the Ellis family (Ben, Susan + Sophie 16, Henry 14, Laura 11) and is persisted to your browser's localStorage.

### Demo PINs

Both parent accounts have PIN `1234`. The kid accounts (Sophie, Henry, Laura) have no PIN — tap their face on the lock screen and you're in.

You can change PINs in **Settings → Family members → tap "PIN set" / "No PIN"**.

### Going live with Supabase + Vercel

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Push the project to GitHub.
4. Import the repo into Vercel.
5. Set environment variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` *(optional — enables AI extraction in the Import Events flow. Without it, the app falls back to a regex extractor.)*
6. Deploy.

---

## What's new in v4

### ⚡ Performance
- **Code-split tabs** — Calendar, Chores, Lists, Habits, Settings each load on demand. Initial bundle dropped from 298KB to 229KB (gzip: 70KB). Lock screen + Home tab paint significantly faster.
- **Skeleton loader** for tab transitions, no flash of empty content.

### 🗑️ Universal swipe-to-delete
- Swipe left on any row (events, list items, habits, chores) to delete it.
- **Parents** get full-swipe — past 55% commits the delete on release. Fast.
- **Kids** get partial-swipe — reveals a red Delete button, tap to confirm. Safer.
- Every delete shows a "Item deleted — Undo" toast for 4 seconds at the bottom of the screen.

### 📅 Habit backfill
- Each habit row now shows the **last 7 days as tappable squares**. Forgot to mark Tuesday's read? Tap the Tuesday square.
- Streak rewards trigger retroactively too — finish a 7-day streak by backfilling and you still get the 10★.
- Today is labelled "Today"; weekdays for the rest. Today's square has a subtle ring.

### 📐 iPad-friendly modals
- Modals are now **wider on tablets** (max 2xl on iPad) and use 2-column grids where it makes sense (e.g. Chore editor: payouts on the left, approval flags on the right).
- Headers and footers are **sticky** — Save and Cancel buttons stay visible regardless of how much you scroll.

### 🤖 AI Import Events
- Press **Import** in the Calendar toolbar to bulk-import events from three sources:
  - **WA holidays + school terms** — hardcoded for 2026 + 2027, works offline. Tick what you want, click Import.
  - **Paste text** — paste a school newsletter or email. AI extracts events with dates, you tick which to import. Uses Claude Haiku 4.5 via a Vercel serverless function (`/api/extract-events.js`); falls back to a built-in regex extractor in demo mode.
  - **iCal feed** — paste a `.ics` URL (most schools and sports clubs publish one). The app parses VEVENT blocks. Note: many feeds block CORS — if yours fails, paste the file contents into the Paste tab.
- All three flows show a unified preview list with **duplicate detection** — if the event is already in your calendar (same title + start date), it's greyed out and skipped.
- Optionally assign imported events to specific family members in one step.

---

## What's been built across all phases

### Lock screen
- Tap-a-face user switcher with member colours and avatars
- PIN pad for parents (kid accounts unlocked by tapping)
- Theme toggle (light / dark / system)

### Home dashboard
- **Member status strip** — tap a card to update your status
- **Today's events** — current and upcoming events for the family (swipeable)
- **Your habits today** — quick-tap check-ins for the active member, with streaks
- **Coming up** — list items overdue or due in the next 7 days
- **Approval card** (parents only) — chore + spending requests
- **Rewards leaderboard** — kid balances + goal progress
- **AI suggestion placeholder**

### Calendar
- Day, week, **and month** views
- **Import events** from WA holidays / paste / iCal
- Member filter chips
- Recurring events (daily, weekdays, weekly, monthly, yearly)
- Event editor with reminders, recurrence, member assignment
- Color-coded by member

### Chores & Rewards
- Kid view: balances, goal progress, today's chores
- Parent view: Overview / Manage chores / Approvals
- Auto-approval thresholds per category
- Spend-points flow with approval gating

### Lists
- Multiple named lists (shared or private)
- Repeating items with cadences (daily → yearly)
- Due dates, assignees, sidebar + items panel

### Habits
- Per-member grids
- **7-day backfill** (new in v4)
- Streak counter + heatmap
- Streak rewards for kids (10★/50★/200★ at 7/30/100 days)
- Private vs shared at creation

### Location
- Manual status — Home / School / Work / Out / Away til...
- Auto-reverts to Home when "Away til" date passes

### Settings
- Theme picker
- Family members + PIN management
- Lock & switch user

---

## The Ellis family seed

| Member | Role | Colour | Birthday | Stars | Screen | Savings | Goal |
|---|---|---|---|---|---|---|---|
| Ben | Parent | Terracotta | — | — | — | — | — |
| Susan | Parent | Sage | — | — | — | — | — |
| Sophie | Child | Rose | 4 Oct 2009 | 184 | 60 min | $42.00 | AirPods ($250) |
| Henry | Child | Dusty Blue | 24 May 2011 | 132 | 30 min | $18.50 | Skateboard deck ($120) |
| Laura | Child | Sand | 11 Sep 2014 | 96 | 45 min | $7.50 | LEGO Friends set ($60) |

---

## Architecture

```
React 18 + TypeScript + Vite + TailwindCSS
├── lazy-loaded tab pages (code splitting)
├── Context providers (Family, Theme, Toast)
├── localStorage (demo) ←→ Supabase (production)
└── Vercel serverless functions:
    └── /api/extract-events.js (Claude-powered text parsing)
```

### Folder layout

```
Home Plus/
├── api/                      Vercel serverless functions
│   └── extract-events.js     Claude API for paste-text imports
├── src/
│   ├── components/           Reusable UI pieces
│   │   ├── SwipeableRow.tsx  Universal swipe-to-delete (v4)
│   │   ├── ImportEventsModal.tsx  Three-source event import (v4)
│   │   └── ...
│   ├── context/              Family + Theme + Toast (v4) global state
│   ├── hooks/                Reusable hooks
│   │   └── useSwipeMode.ts   Picks partial/full based on role (v4)
│   ├── lib/                  Domain helpers
│   │   ├── holidays.ts       WA holidays + school terms (v4)
│   │   └── ...
│   ├── pages/                Route-level views (lazy-loaded)
│   ├── styles/               Global CSS + Tailwind base
│   └── types/                Shared TypeScript types
└── supabase/
    └── schema.sql            Database schema + RLS policies
```

### Key design decisions

- **Demo mode is first-class.** Without env vars, the app uses localStorage. Ditto for AI features — without `ANTHROPIC_API_KEY`, the regex fallback runs.
- **One Supabase auth account per family.** Members are profiles; parents have PINs, kids don't.
- **Member colours travel.** Avatars, event chips, calendar bars, balance cards — all the same hue.
- **Auto-approval thresholds** per category for spend requests.
- **Universal swipe pattern** with role-based safety: parents fast, kids confirmed.
- **Schema cache-bust** via SEED_VERSION (now at 4) — old localStorage clears on first load.

---

## What's next

| Phase | Status | What |
|---|---|---|
| 1 | ✅ Done | Foundation, calendar, day/week views |
| 2 | ✅ Done | Chores, rewards, redemptions, goals, monthly view, PINs |
| 3 | ✅ Done | Lists, habits, location status |
| **4 / v4** | ✅ Done | Perf, swipe-to-delete, habit backfill, modal sizing, AI import |
| 5 | Next | Kitchen Plus merge — recipes, meal plan, shopping list, cupboard |
| 6 | After | AI assistant on the home tab + Google Calendar sync |

---

## Demo PIN reference

- **Ben** — `1234`
- **Susan** — `1234`
- **Sophie / Henry / Laura** — no PIN, tap to enter

Change all of these in Settings before sharing the device.
