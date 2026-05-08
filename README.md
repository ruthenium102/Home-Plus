# Home Plus

A family operating system for the kitchen tablet — calendar, chores, rewards, lists, habits, location status, and (soon) the full Kitchen Plus app.

This is **Phase 3** of the build. Phases 1, 2, and 3 are complete.

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

You can change PINs anywhere in **Settings → Family members → tap "PIN set" / "No PIN"**.

### Going live with Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. `npm run dev` again — the demo banner disappears and writes go to your project.

---

## What's built

### Lock screen
- Tap-a-face user switcher with member colours and avatars
- PIN pad for parents (kid accounts unlocked by tapping)
- Theme toggle (light / dark / system)

### Home dashboard
- **Member status strip** — five tappable cards showing where everyone is. Tap any card to update your status (Home / School / Work / Out / Away til...).
- **Today's events** — current and upcoming events for the family
- **Your habits today** — quick-tap check-ins for the active member, with streaks
- **Coming up** — list items overdue or due in the next 7 days
- **Approval card** (parents only) — appears when chore completions or spending requests are waiting
- **Rewards leaderboard** — kid balances with progress bar toward each kid's current goal
- **AI suggestion placeholder** — wired up in Phase 5

### Calendar
- Day, week, and month views
- Member filter chips
- Recurring events (daily, weekdays, weekly with day-picker, monthly, yearly)
- Categories: medical, school, sport, social, meal, work, other
- Event editor with start/end, location, description, member assignment, reminders, recurrence
- Color-coded event chips by primary owner's colour
- Today highlighting; "+N more" overflow on month view; tap a day to jump to its day view

### Chores & Rewards
- **Kid view** — personal banner in their colour, three balance cards (stars / screen time / savings), savings-goal progress bar, today's chores. Tap a chore to complete it.
- **Spend points** — kids redeem with quick-pick presets. Auto-approves under each category's threshold; bigger spends and any cash savings withdrawal need parent approval.
- **Parent view** — Overview / Manage chores / Approvals
- Auto-approval thresholds:
  - Stars: under 30 ★ auto-approves
  - Screen time: under 30 min auto-approves
  - Savings: any cash withdrawal needs approval

### Lists (Phase 3)
- **Multiple named lists** with custom icon and colour (e.g. "House admin", "Hardware store", "Sophie school")
- **Shared or private** — shared lists visible to the whole family; private lists only the owner sees
- **Repeating items** for household maintenance — daily, weekly, monthly, quarterly, every 6 months, yearly. Tick the item, the next occurrence is automatically scheduled.
- **Due dates** with relative formatting (today, tomorrow, in 3 days, etc.)
- **Assignees** for shared lists (Mum does the bills, Dad does the bins)
- Sidebar of lists, panel of items; sort puts open above done

### Habits (Phase 3)
- **Per-member habit grid** — each member owns their own habits
- **Private or shared** at creation — Ben's morning walk is private, Sophie's reading habit is family-visible
- **Cadences** — daily, weekdays, weekend, weekly
- **Streak counter** with last-7-days heatmap
- **Streak rewards** for kids — toggleable per habit. Hits a milestone (7, 30, 100 days), kid gets stars: 10★ / 50★ / 200★
- One tap to check in for the day; tap again to undo

### Location status (Phase 3)
- **Manual status** — tap your face on the home strip to update
- **Quick presets** — Home / School / Work / Out
- **Away til...** — pick a destination + return date. Status auto-resets to Home on the return date next time the app loads.

### Settings
- Theme picker
- Family members list with role, birthday, colour picker, PIN management
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

**Seeded chores** (8): make bed, dishwasher, dog, bins, bathroom, vacuum, dinner prep, bedroom tidy.

**Seeded lists** (4):
- House admin (shared) — smoke alarms, AC service, windows, water filter, car insurance
- Hardware store (shared) — picture hooks, light bulbs, hose connector
- Sophie school (private) — permission slip due in 5 days, uniform shirt
- Ben's list (private) — book dentist, renew passport in 30 days

**Seeded habits** (5):
- Sophie: Read 20 min (shared, streak rewards on, 4-day streak)
- Henry: Practise piano weekdays (shared, streak rewards on, rebuilding)
- Laura: Brush teeth (shared, no rewards, 3-day streak)
- Ben: Morning walk (private)
- Susan: Yoga weekly (shared)

---

## Architecture

```
React 18 + TypeScript + Vite + TailwindCSS
↓
Context providers (Family, Theme)
↓
localStorage (demo) ←→ Supabase (production)
```

### Folder layout

```
src/
├── components/        Reusable UI pieces
├── context/           Family + Theme global state
├── lib/               Domain helpers (chores, habits, lists, recurrence, colors)
├── pages/             Route-level views
├── styles/            Global CSS + Tailwind base
└── types/             Shared TypeScript types
supabase/
└── schema.sql         Database schema + RLS policies (Phases 1-3)
```

### Key design decisions

- **One Supabase auth account per family.** Members are profiles inside that account, not separate auth users. Parents have PINs, kids don't.
- **Demo mode is first-class.** If `VITE_SUPABASE_URL` is missing, the app uses localStorage. This was the bug that blocked Kitchen Plus signups, so we lean into it.
- **Member colors travel with the person.** Avatars, event chips, calendar bars, balance cards, kid banner — all the same hue.
- **Auto-approval thresholds, not a binary trust setting.** Small spends are fast; big ones gate. Configurable per category.
- **JSONB payouts.** Each chore stores its payout as `{ stars: 5, screen_minutes: 10 }` instead of three columns — easy to add categories later.
- **Lists vs chores.** Chores are recurring assigned tasks with rewards. Lists are flexible — house maintenance, shopping, school admin — with optional repeat but no payout.
- **Shared / private toggle on lists and habits.** Same model in both: `owner_id null` = shared, `owner_id = member.id` = private. Consistent mental model.
- **Manual location only.** Phase 3 keeps it simple. GPS-based statuses come later via the iPhone app.
- **Schema cache-bust via SEED_VERSION.** When demo data shape changes (`SEED_VERSION` bumps from 2 → 3), localStorage is wiped on next load so users don't see stale stuff.

---

## What's next

| Phase | Status | What |
|---|---|---|
| 1 | ✅ Done | Foundation, calendar, day/week views |
| 2 | ✅ Done | Chores, rewards, redemptions, goals, monthly view, PIN management |
| 3 | ✅ Done | Lists, habits, location status |
| 4 | Next | Kitchen Plus merge — recipes, meal plan, shopping list, cupboard |
| 5 | Last | AI assistant on the home tab |

---

## Demo PIN reference

- **Ben** — `1234`
- **Susan** — `1234`
- **Sophie / Henry / Laura** — no PIN, tap to enter

Change all of these in Settings before sharing the device.
