# Manual device test plan (run before every TestFlight / App Store build)

From the 2026-07-07 release review (Q3). Run on a **real iPhone AND iPad**,
dark + light theme. Check items off per release; anything failing blocks the
archive.

## Setup / accounts
- [ ] Fresh install → signup → create family (v25 regression: the first member
      row must appear — onboarding used to dead-end here)
- [ ] Invite a second member → accept on another device/account → joined member
      immediately sees shared calendar/chores/lists (RLS visibility)
- [ ] Account deletion completes end-to-end against prod (Settings → Delete)
- [ ] Voice: mic + speech permission prompts appear; recognition works with
      on-device-only recognition forced (v1.0.125); child without voice consent
      is blocked

## Drag & gesture (regressed 3× — test all six surfaces)
- [ ] Drag-reorder on long scrollable lists: Lists, Chores, Habits, My Day
      pool, Settings members — grip-handle drags reorder; swiping elsewhere on
      the row still triggers swipe-to-delete; page scroll never fights the drag
- [ ] Pet treats: quick swipe over the tray scrolls (no grab); hold ~160 ms
      lifts the treat (haptic + pop + floating ghost), drag onto pet feeds
- [ ] iPad: rotate portrait↔landscape mid-drag — no drop/misfire

## Virtual pet
- [ ] Cold launch (not warm reload): first tap on feed/pat plays sound (Web
      Audio warm-up); mute toggle persists across launches
- [ ] Two kids' profiles on ONE shared iPad: quests + evolution overlays stay
      scoped per pet (no cross-contamination)
- [ ] Quest rollover: advance device clock past local midnight → quests reroll,
      yesterday's claims don't leak
- [ ] Evolution overlay fires once per stage, not on every visit

## Sync & offline
- [ ] Airplane mode mid-session → tick chores/list items → restore wifi →
      changes sync (write outbox, v1.0.128); nothing silently disappears
- [ ] Overnight-idle iPad: next-morning foreground catches up midnight rollover
      (habits, quests, away-status revert, repeating items)

## Away status / calendar / kitchen
- [ ] "Away til <date>": calendar event spans through the until-date; status
      still Away ON the date; reverts the day after
- [ ] Meal planner week boundaries correct across a month rollover (Mon start)
- [ ] Recipe grid: add/import/edit/favourite/search/delete; empty +
      empty-search states; uniform row heights with long titles

## Theme / chrome
- [ ] In-app theme opposite to system: overscroll band never flashes white
      (top + bottom, dark page); status bar matches; background/foreground flip
- [ ] Scroll feel: fling glides and rubber-bands at both ends (deceleration
      0.996 — Ben-approved; don't re-tune casually)
- [ ] iPad side rail open/close; floating dock on iPhone; safe areas in
      landscape (notch sides, home indicator)

## Google / email integrations
- [ ] Google Calendar connect → OAuth round-trip against the -lyart redirect →
      events sync both ways; disconnect works
- [ ] Invite email arrives (Resend) and the accept link works
