import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  CheckCircle2,
  Circle,
  Lock,
  Users,
  Repeat,
  Calendar as CalendarIcon,
  Pencil,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useListsData, useMembersData, useFamilyActions, type FamilyActions } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { useListDragReorder } from '@/hooks/useListDragReorder';
import { ListIcon } from '@/components/ListIcon';
import { ListItemEditor } from '@/components/ListItemEditor';

// Lazy: ListEditor drags the ~300-icon picker catalog (`lib/listIcons`) with
// it, which used to make ListsPage the heaviest tab chunk in the app (~145 kB)
// and pay a parse hitch on every first open. Split out, the editor + catalog
// load as an async chunk after the tab has painted.
const ListEditor = lazy(() =>
  import('@/components/ListEditor').then((m) => ({ default: m.ListEditor })),
);
import { Avatar } from '@/components/Avatar';
import { DragHandle } from '@/components/DragHandle';
import { DropIndicator } from '@/components/DropIndicator';
import { SwipeableRow } from '@/components/SwipeableRow';
import { getColorTokens } from '@/lib/colors';
import {
  visibleLists,
  sortedItems,
  formatDue,
  formatRepeat,
  isDueSoon,
  isOverdue,
  findAssignee,
} from '@/lib/lists';
import type { TodoItem, TodoList, FamilyMember } from '@/types';

export function ListsPage() {
  const { lists, listItems } = useListsData();
  const { activeMember, members } = useMembersData();
  const { reorderLists, reorderListItems } = useFamilyActions();
  const { resolved } = useTheme();

  const myLists = useMemo(
    () => (activeMember ? visibleLists(lists, activeMember.id) : []),
    [lists, activeMember],
  );
  const listDnd = useListDragReorder(myLists, reorderLists);

  const [activeListId, setActiveListId] = useState<string | null>(() => myLists[0]?.id || null);
  const [listEditorOpen, setListEditorOpen] = useState(false);
  const [editingList, setEditingList] = useState<TodoList | null>(null);
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null);

  // If active list disappears (deleted, etc), pick a new one
  if (activeListId && !myLists.find((l) => l.id === activeListId) && myLists.length > 0) {
    setActiveListId(myLists[0].id);
  }

  const activeList = myLists.find((l) => l.id === activeListId) || null;
  const activeItems = useMemo(() => {
    if (!activeList) return [];
    return sortedItems(listItems.filter((i) => i.list_id === activeList.id));
  }, [activeList, listItems]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[270px_1fr] gap-4">
      {/* List sidebar */}
      <aside className="card p-2 self-start">
        <div className="flex items-center justify-between p-2 mb-1">
          <h2 className="font-display text-base text-text">Lists</h2>
          <button
            onClick={() => {
              setEditingList(null);
              setListEditorOpen(true);
            }}
            className="w-7 h-7 rounded-md bg-accent-strong text-white flex items-center justify-center hover:opacity-90"
            title="New list"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="space-y-0.5">
          {myLists.map((list) => {
            const tokens = list.color ? getColorTokens(list.color, resolved === 'dark') : null;
            const isActive = list.id === activeListId;
            const itemCount = listItems.filter((i) => i.list_id === list.id && !i.done).length;

            const { dropEdge, handleProps, ...rowHandlers } = listDnd.getRowProps(list.id);
            return (
              <div
                key={list.id}
                {...rowHandlers}
                className={
                  'relative flex items-center gap-2 px-2 py-2 rounded-md transition-colors group select-none ' +
                  (isActive ? 'bg-surface-2' : 'hover:bg-surface-2/60')
                }
              >
                {dropEdge && <DropIndicator edge={dropEdge} />}
                <DragHandle handleProps={handleProps} />
                <button
                  onClick={() => setActiveListId(list.id)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    style={{
                      background: tokens?.soft || 'rgb(var(--surface-2))',
                      color: tokens?.base || 'rgb(var(--text-muted))',
                    }}
                  >
                    <ListIcon name={list.icon} size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text truncate flex items-center gap-1.5">
                      {list.name}
                      {list.owner_id !== null ? (
                        <Lock size={10} className="text-text-faint shrink-0" />
                      ) : null}
                    </div>
                  </div>
                  {itemCount > 0 && (
                    <span className="text-xs text-text-faint tabular-nums">{itemCount}</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setActiveListId(list.id);
                    setEditingList(list);
                    setListEditorOpen(true);
                  }}
                  // Always faintly visible: hover-only visibility made this
                  // button unreachable on touch devices (no hover state).
                  className="w-6 h-6 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                  title="Edit list"
                >
                  <Pencil size={11} />
                </button>
              </div>
            );
          })}
          {myLists.length === 0 && (
            <div className="text-xs text-text-faint text-center py-6">
              No lists yet — tap + to create one.
            </div>
          )}
        </div>
      </aside>

      {/* Items panel */}
      <main>
        {activeList ? (
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-display text-xl text-text truncate">{activeList.name}</h2>
                <button
                  onClick={() => {
                    setEditingList(activeList);
                    setListEditorOpen(true);
                  }}
                  className="w-7 h-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text"
                  title="Edit list"
                >
                  <Pencil size={12} />
                </button>
                {activeList.owner_id === null ? (
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-faint">
                    <Users size={10} /> Shared
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-faint">
                    <Lock size={10} /> Private
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setEditingItem(null);
                  setItemEditorOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-strong text-white text-sm font-medium rounded-md hover:opacity-90"
              >
                <Plus size={14} /> Item
              </button>
            </div>

            {activeItems.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-text-faint mb-3">No items here yet.</div>
                <button
                  onClick={() => {
                    setEditingItem(null);
                    setItemEditorOpen(true);
                  }}
                  className="text-sm text-accent hover:underline"
                >
                  Add the first one →
                </button>
              </div>
            ) : (
              <ItemsList
                list={activeList}
                items={activeItems}
                members={members}
                onEditItem={(item) => {
                  setEditingItem(item);
                  setItemEditorOpen(true);
                }}
                onReorderItems={(orderedIds) => reorderListItems(activeList.id, orderedIds)}
              />
            )}
          </div>
        ) : (
          <div className="card p-12 text-center text-text-faint">
            Pick a list from the sidebar, or create a new one.
          </div>
        )}
      </main>

      <Suspense fallback={null}>
        <ListEditor
          open={listEditorOpen}
          editing={editingList}
          onClose={() => {
            setListEditorOpen(false);
            setEditingList(null);
          }}
        />
      </Suspense>
      {activeList && (
        <ListItemEditor
          open={itemEditorOpen}
          list={activeList}
          editing={editingItem}
          onClose={() => {
            setItemEditorOpen(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

function ItemsList({
  list,
  items,
  members,
  onEditItem,
  onReorderItems,
}: {
  list: TodoList;
  items: TodoItem[];
  members: FamilyMember[];
  onEditItem: (item: TodoItem) => void;
  onReorderItems: (orderedIds: string[]) => void;
}) {
  const itemDnd = useListDragReorder(items, onReorderItems);
  // Hoist the context subscriptions OUT of the per-row component. A component
  // that calls useFamily()/useToast() re-renders on every context change no
  // matter what React.memo says, so the rows could never be memoized while they
  // read context directly. These actions are all stable (useCallback) and
  // swipeMode is a primitive, so passing them down as props lets ListItemRow
  // skip re-render when an unrelated item (or an unrelated context slice, e.g.
  // the 90s cloud poll) changes — only the toggled row re-renders.
  const { toggleListItem, deleteListItem, restoreListItem } = useFamilyActions();
  const { show } = useToast();
  const swipeMode = useSwipeMode();
  const [showCompleted, setShowCompleted] = useState(true);

  // Reminders-style completion grace. Checking an item commits the write
  // immediately, but the row HOLDS its place in the active section — checked
  // and struck through — for a beat, then collapses away into Completed.
  // Without this the row teleports between sections on the very tap, which
  // reads as jank and gives no window to un-tick a mis-tap in place.
  // 'grace' = checked, still holding position; 'leaving' = collapse running.
  const GRACE_MS = 1400;
  const COLLAPSE_MS = 300;
  const [pendingDone, setPendingDone] = useState<ReadonlyMap<string, 'grace' | 'leaving'>>(
    new Map(),
  );
  const pendingTimers = useRef(new Map<string, number[]>());
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => timers.forEach((ids) => ids.forEach((t) => window.clearTimeout(t)));
  }, []);

  const clearPending = useCallback((id: string) => {
    pendingTimers.current.get(id)?.forEach((t) => window.clearTimeout(t));
    pendingTimers.current.delete(id);
    setPendingDone((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    (item: TodoItem) => {
      toggleListItem(item.id);
      if (item.done) {
        // Un-checking — cancel any in-flight grace; the row moves back to the
        // active section on this very render, no delay wanted.
        clearPending(item.id);
        return;
      }
      pendingTimers.current.get(item.id)?.forEach((t) => window.clearTimeout(t));
      setPendingDone((prev) => new Map(prev).set(item.id, 'grace'));
      const toLeaving = window.setTimeout(() => {
        setPendingDone((prev) =>
          prev.get(item.id) === 'grace' ? new Map(prev).set(item.id, 'leaving') : prev,
        );
      }, GRACE_MS);
      const toGone = window.setTimeout(() => clearPending(item.id), GRACE_MS + COLLAPSE_MS);
      pendingTimers.current.set(item.id, [toLeaving, toGone]);
    },
    [toggleListItem, clearPending],
  );

  const activeItems = items.filter((i) => !i.done || pendingDone.has(i.id));
  const completedItems = items.filter((i) => i.done && !pendingDone.has(i.id));

  // Row budget (X6): every row carries SwipeableRow pointer handlers + a drag
  // handle, so a power-user list with hundreds of items pays real mount and
  // drag-hit-testing cost. Render the first chunk and reveal the rest on tap —
  // cheaper and less invasive than virtualisation, which would fight the
  // drag/swipe hit-testing.
  const ROW_BUDGET = 60;
  const [showAllActive, setShowAllActive] = useState(false);
  const visibleActive =
    showAllActive || activeItems.length <= ROW_BUDGET
      ? activeItems
      : activeItems.slice(0, ROW_BUDGET);

  // Each row sits in a 1fr grid track; 'leaving' animates the track to 0fr
  // (works for any row height, no measuring) + fades, then the grace clears
  // and the row re-renders down in the Completed section.
  const renderRow = (item: TodoItem) => {
    const phase = pendingDone.get(item.id);
    return (
      <div
        key={item.id}
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
        style={{
          gridTemplateRows: phase === 'leaving' ? '0fr' : '1fr',
          opacity: phase === 'leaving' ? 0 : 1,
        }}
      >
        <div className={phase === 'leaving' ? 'min-h-0 overflow-hidden' : 'min-h-0'}>
          <ListItemRow
            item={item}
            list={list}
            members={members}
            swipeMode={swipeMode}
            dragProps={itemDnd.getRowProps(item.id)}
            onToggle={handleToggle}
            deleteListItem={deleteListItem}
            restoreListItem={restoreListItem}
            showToast={show}
            onEdit={onEditItem}
          />
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="divide-y divide-border">{visibleActive.map(renderRow)}</div>
      {visibleActive.length < activeItems.length && (
        <button
          onClick={() => setShowAllActive(true)}
          className="w-full px-3 py-2.5 min-h-[44px] text-xs font-medium text-text-muted hover:text-text border-t border-border transition-colors"
        >
          Show {activeItems.length - visibleActive.length} more…
        </button>
      )}
      {completedItems.length > 0 && (
        <div className={activeItems.length > 0 ? 'mt-2 border-t border-border' : undefined}>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-1.5 w-full px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-text-faint hover:text-text transition-colors"
          >
            {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Completed ({completedItems.length})
          </button>
          {showCompleted && (
            <div className="divide-y divide-border border-t border-border">
              {completedItems.map(renderRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ListItemRowProps = {
  item: TodoItem;
  list: TodoList;
  members: FamilyMember[];
  swipeMode: 'partial' | 'full';
  dragProps: ReturnType<ReturnType<typeof useListDragReorder<TodoItem>>['getRowProps']>;
  onToggle: (item: TodoItem) => void;
  deleteListItem: FamilyActions['deleteListItem'];
  restoreListItem: FamilyActions['restoreListItem'];
  showToast: ReturnType<typeof useToast>['show'];
  onEdit: (item: TodoItem) => void;
};

/**
 * Skip a row's re-render unless something it actually renders changed.
 *
 * Compares the data the row reads (item ref, members ref, the two list fields
 * it uses, swipeMode, and the drag PRIMITIVES). Function props are
 * intentionally ignored: toggleListItem/deleteListItem/restoreListItem/
 * showToast/onEdit are logically stable (same behaviour for this item.id), and the drag
 * handlers from useListDragReorder read live state through refs, so retaining a
 * prior closure on a skipped render stays correct. `item` keeps its identity
 * for untouched rows (toggle only replaces the one edited item), so ticking one
 * item re-renders one row instead of the whole list.
 */
function areRowPropsEqual(a: ListItemRowProps, b: ListItemRowProps): boolean {
  return (
    a.item === b.item &&
    a.members === b.members &&
    a.swipeMode === b.swipeMode &&
    a.list.id === b.list.id &&
    a.list.owner_id === b.list.owner_id &&
    a.dragProps.isDragging === b.dragProps.isDragging &&
    a.dragProps.dropEdge === b.dragProps.dropEdge
  );
}

const ListItemRow = memo(function ListItemRow({
  item,
  list,
  members,
  swipeMode,
  dragProps,
  onToggle,
  deleteListItem,
  restoreListItem,
  showToast,
  onEdit,
}: ListItemRowProps) {
  const assignee = findAssignee(members, item);
  const dueLabel = item.next_due || item.due_date;
  const overdue = isOverdue(item);
  const dueSoon = isDueSoon(item, 7);

  // Pop the check only when it flips WHILE this row is mounted (a real tap),
  // not on every mount of an already-done row (expanding Completed would make
  // the whole section pop at once).
  const prevDone = useRef(item.done);
  const justChecked = item.done && !prevDone.current;
  useEffect(() => {
    prevDone.current = item.done;
  });

  const handleDelete = () => {
    // Snapshot for undo — restored with the same id and full content.
    const snapshot = { ...item };
    deleteListItem(item.id);
    showToast({
      message: `"${item.title}" deleted`,
      onUndo: () => restoreListItem(snapshot),
    });
  };

  const { dropEdge, handleProps, ...rowHandlers } = dragProps;
  return (
    <div className="relative">
      {dropEdge && <DropIndicator edge={dropEdge} />}
      <SwipeableRow onDelete={handleDelete} mode={swipeMode}>
        <div
          {...rowHandlers}
          className="relative flex items-center gap-2 p-3 bg-surface-2/40 hover:bg-surface-2/70 transition-colors select-none"
        >
          <DragHandle handleProps={handleProps} />
          <button data-no-swipe onClick={() => onToggle(item)} className="shrink-0">
            {item.done ? (
              <CheckCircle2
                size={20}
                className={'text-accent' + (justChecked ? ' animate-check-pop' : '')}
              />
            ) : (
              <Circle size={20} className="text-text-faint hover:text-text" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div
              className={
                'text-sm ' + (item.done ? 'text-text-muted line-through' : 'text-text font-medium')
              }
            >
              {item.title}
            </div>
            {item.notes && !item.done && (
              <div className="text-xs text-text-faint mt-0.5">{item.notes}</div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-text-faint">
              {item.repeat !== 'never' && (
                <span className="flex items-center gap-1">
                  <Repeat size={10} /> {formatRepeat(item.repeat)}
                </span>
              )}
              {dueLabel && (
                <span
                  className={
                    'flex items-center gap-1 ' +
                    (overdue && !item.done
                      ? 'text-accent font-medium'
                      : dueSoon && !item.done
                        ? 'text-text-muted'
                        : '')
                  }
                >
                  <CalendarIcon size={10} /> {formatDue(dueLabel)}
                </span>
              )}
              {item.done && item.repeat !== 'never' && item.next_due && (
                <span className="text-text-faint">Next: {formatDue(item.next_due)}</span>
              )}
            </div>
          </div>
          {list.owner_id === null && assignee && <Avatar member={assignee} size={26} />}
          <button
            onClick={() => onEdit(item)}
            className="w-7 h-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text shrink-0"
            title="Edit item"
          >
            <Pencil size={12} />
          </button>
        </div>
      </SwipeableRow>
    </div>
  );
}, areRowPropsEqual);
