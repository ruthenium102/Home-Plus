-- v23 — Synced display order for habits, chores, and todo lists (UX)
-- Drag-to-reorder previously stored the order in device localStorage only, so
-- it never synced across devices and vanished on reinstall. The client now
-- writes position 0..n on reorder and sorts by it (nulls last, oldest first).
-- Idempotent.

alter table habits
  add column if not exists position integer;

alter table chores
  add column if not exists position integer;

alter table todo_lists
  add column if not exists position integer;
