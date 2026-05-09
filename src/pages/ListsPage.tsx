import { useMemo, useState } from 'react';
import {
  Plus,
  CheckCircle2,
  Circle,
  Lock,
  Users,
  Repeat,
  Calendar as CalendarIcon,
  Pencil
} from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { ListEditor, getListIcon } from '@/components/ListEditor';
import { ListItemEditor } from '@/components/ListItemEditor';
import { Avatar } from '@/components/Avatar';
import { SwipeableRow } from '@/components/SwipeableRow';
import { getColorTokens } from '@/lib/colors';
import {
  visibleLists,
  sortedItems,
  formatDue,
  formatRepeat,
  isDueSoon,
  isOverdue,
  findAssignee
} from '@/lib/lists';
import type { TodoItem, TodoList } from '@/types';

export function ListsPage() {
  const { lists, listItems, activeMember, members } = useFamily();
  const { resolved } = useTheme();

  const myLists = useMemo(
    () => (activeMember ? visibleLists(lists, activeMember.id) : []),
    [lists, activeMember]
  );

  const [activeListId, setActiveListId] = useState<string | null>(
    () => myLists[0]?.id || null
  );
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
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
      {/* List sidebar */}
      <aside className="card p-2 self-start">
        <div className="flex items-center justify-between p-2 mb-1">
          <h2 className="font-display text-base text-text">Lists</h2>
          <button
            onClick={() => {
              setEditingList(null);
              setListEditorOpen(true);
            }}
            className="w-7 h-7 rounded-md bg-accent text-white flex items-center justify-center hover:opacity-90"
            title="New list"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="space-y-0.5">
          {myLists.map((list) => {
            const Icon = getListIcon(list.icon);
            const tokens = list.color
              ? getColorTokens(list.color, resolved === 'dark')
              : null;
            const isActive = list.id === activeListId;
            const itemCount = listItems.filter(
              (i) => i.list_id === list.id && !i.done
            ).length;

            return (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={
                  'w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors ' +
                  (isActive ? 'bg-surface-2' : 'hover:bg-surface-2/60')
                }
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    background: tokens?.soft || 'rgb(var(--surface-2))',
                    color: tokens?.base || 'rgb(var(--text-muted))'
                  }}
                >
                  <Icon size={14} />
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
                  <span className="text-xs text-text-faint tabular-nums">
                    {itemCount}
                  </span>
                )}
              </button>
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
                <h2 className="font-display text-xl text-text truncate">
                  {activeList.name}
                </h2>
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90"
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
              <div className="divide-y divide-border">
                {activeItems.map((item) => (
                  <ListItemRow
                    key={item.id}
                    item={item}
                    list={activeList}
                    members={members}
                    onEdit={() => {
                      setEditingItem(item);
                      setItemEditorOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card p-12 text-center text-text-faint">
            Pick a list from the sidebar, or create a new one.
          </div>
        )}
      </main>

      <ListEditor
        open={listEditorOpen}
        editing={editingList}
        onClose={() => {
          setListEditorOpen(false);
          setEditingList(null);
        }}
      />
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

function ListItemRow({
  item,
  list,
  members,
  onEdit
}: {
  item: TodoItem;
  list: TodoList;
  members: ReturnType<typeof useFamily>['members'];
  onEdit: () => void;
}) {
  const { toggleListItem, deleteListItem, addListItem } = useFamily();
  const { show } = useToast();
  const swipeMode = useSwipeMode();
  const assignee = findAssignee(members, item);
  const dueLabel = item.next_due || item.due_date;
  const overdue = isOverdue(item);
  const dueSoon = isDueSoon(item, 7);

  const handleDelete = () => {
    // Snapshot for undo
    const snapshot = { ...item };
    deleteListItem(item.id);
    show({
      message: `"${item.title}" deleted`,
      onUndo: () => {
        addListItem({
          list_id: snapshot.list_id,
          title: snapshot.title,
          notes: snapshot.notes,
          done: snapshot.done,
          done_at: snapshot.done_at,
          repeat: snapshot.repeat,
          next_due: snapshot.next_due,
          due_date: snapshot.due_date,
          assigned_to: snapshot.assigned_to,
          position: snapshot.position
        });
      }
    });
  };

  return (
    <SwipeableRow onDelete={handleDelete} mode={swipeMode}>
      <div className="flex items-start gap-3 p-3 hover:bg-surface-2/50 transition-colors group">
        <button
          data-no-swipe
          onClick={() => toggleListItem(item.id)}
          className="shrink-0 mt-0.5"
        >
          {item.done ? (
            <CheckCircle2 size={20} className="text-accent" />
          ) : (
            <Circle size={20} className="text-text-faint hover:text-text" />
          )}
        </button>
        <button
          onClick={onEdit}
          className="flex-1 min-w-0 text-left"
        >
          <div
            className={
              'text-sm ' +
              (item.done
                ? 'text-text-muted line-through'
                : 'text-text font-medium')
            }
          >
            {item.title}
          </div>
          {item.notes && !item.done && (
            <div className="text-xs text-text-faint mt-0.5">{item.notes}</div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-text-faint">
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
              <span className="text-text-faint">
                Next: {formatDue(item.next_due)}
              </span>
            )}
          </div>
        </button>
        {list.owner_id === null && assignee && (
          <Avatar member={assignee} size={26} />
        )}
        <Pencil size={13} className="text-text-faint shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
      </div>
    </SwipeableRow>
  );
}
