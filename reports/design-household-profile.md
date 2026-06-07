# Design Spec — Household ("Family") Profile

_Status: spec approved (decisions locked 2026-06-07). Not yet implemented._

## 1. Goal
A single shared profile for the communal kitchen-bench iPad that surfaces the
whole family's **shared** content at a glance, with no per-person filtering and
no PIN. It is the default "command centre." It **complements** the existing
per-member profiles (PIN-gated), which you still switch into for personal/private
content. Parent-managed.

## 2. Concept
- A special **Household profile** (not a person), labelled **"Family"** by
  default and **editable** (parent-managed, in Settings).
- **No PIN.** It is the **default active profile on a fresh device**; the device
  then **remembers the last-used profile** and resumes it on next open.
- Appears as the **first tile in the User Switcher**, before the members.
- When active it shows the **aggregate family view** (everything shared) and lets
  you create shared items; actions that belong to a person are attributed by
  context, prompting "who?" only when ambiguous (see §5).

## 3. Decisions (locked)
1. **Name:** default "Family", editable. Stored as `families.household_label`
   (new column, default 'Family'); falls back to "Family" if unset.
2. **Default + memory:** on a device with no saved session, Household is active.
   The active profile (household | member) is persisted per device (localStorage,
   extend the existing `SESSION_KEY`) and resumed next launch.
3. **Private items:** hidden in the household view (respect `todo_lists.owner_id`,
   habit `visibility = 'private'`, private events).
4. **Voice:** enabled in household mode; since there is no active member, voice
   prompts "Who's this for?" (member chips) before dispatch. Per-child voice
   consent still applies to the chosen member.

## 4. Per-screen behaviour (household active)
| Screen | Behaviour |
|---|---|
| **Home** | Family command-centre: today's events (all members), chores due today (all), each member's habits grouped by person, tonight's meal, weather. |
| **Calendar** | Defaults to the **Everyone** filter; all events; create → assign members. |
| **Habits** | All members' habits grouped by member; logging attributes to that member (owner known from the grouping). |
| **Chores** | All chores; completing attributes to the assignee. |
| **Lists** | **Shared** lists only (private hidden). |
| **Kitchen** (recipes / meal plan / shopping) | Already family-shared — unchanged; the main beneficiary. |
| **My Day** | Per-person timeline → **hidden** in household mode. (V2: read-only "family day".) |
| **Pet** | Per-child → hidden. (V2: read-only kids'-pet gallery.) |

## 5. Member-specific actions (the key interaction)
Logging a habit, completing a chore, earning stars, and voice all need a member,
but household mode has none. Model: **attribute by context** — where the item
already belongs to someone (a habit grouped under "Henry", a chore assigned to
"Sophie") the action auto-attributes with no prompt; for genuinely ambiguous
actions (voice, a new personal item) show a **"Who's this for?"** member-chip
picker.

## 6. Architecture
- Today the app assumes a single `activeMember` (habit logging, My Day, voice
  `active_member_id`, rewards). Introduce a **session mode**:
  `active = { kind: 'household' } | { kind: 'member', id }`, persisted in
  `SESSION_KEY`. `activeMember` is `null` in household mode; screens branch on it.
- **No new tables.** One column: `families.household_label` (migration). It's a
  view/session mode over existing data.
- Reuse existing shared/private modelling; household view filters out private.
- Household = no PIN; switching **into** a member stays PIN-gated; household
  cannot change a member's account/PIN (parent must sign in).

## 7. Parent controls (Settings)
- Edit the household label (default "Family").
- (V2) toggles for what the household view surfaces.

## 8. Edge cases
- Empty / single-member family.
- Private items hidden (not greyed) in household view.
- Voice: always prompts for member in household mode; respects per-child consent.
- Reward redemption from household: require choosing a member (V2: parent PIN).

## 9. Phasing
- **MVP:** Household tile (PIN-less, default, remembered); editable label;
  aggregate Home + Calendar(Everyone) + Habits(grouped, auto-attributed) +
  Chores + shared Lists + Kitchen; My Day/Pet hidden; ambiguous actions prompt
  "who"; private hidden.
- **V2:** read-only family-day, kids'-pet gallery, household-view toggles,
  richer command-centre Home, parent-PIN on reward redemption.

## 10. Build notes
- Touch points: `FamilyContext` (session mode + activeMember nullable), `UserSwitcher`
  (Household tile), `App`/AuthGate (default + remember), `TopBar` (label + glyph),
  each page (household branch / Everyone filter / hide private / hide My Day+Pet),
  `useVoiceIntake` (prompt for member), Settings (edit label), migration for
  `families.household_label`.
