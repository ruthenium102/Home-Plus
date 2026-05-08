import { useEffect, useState } from 'react';
import { X, Trash2, Repeat } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { Avatar } from './Avatar';
import { REPEAT_OPTIONS } from '@/lib/lists';
import type { TodoItem, TodoList, ListItemRepeat } from '@/types';

interface Props {
  open: boolean;
  list: TodoList;
  editing: TodoItem | null;
  onClose: () => void;
}

export function ListItemEditor({ open, list, editing, onClose }: Props) {
  const { members, addListItem, updateListItem, deleteListItem, listItems } = useFamily();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [repeat, setRepeat] = useState<ListItemRepeat>('never');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setNotes(editing.notes || '');
      setRepeat(editing.repeat);
      setDueDate(editing.due_date || editing.next_due || '');
      setAssignedTo(editing.assigned_to);
    } else {
      setTitle('');
      setNotes('');
      setRepeat('never');
      setDueDate('');
      setAssignedTo(null);
    }
  }, [open, editing]);

  if (!open) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    const isRepeating = repeat !== 'never';
    const payload = {
      list_id: list.id,
      title: title.trim(),
      notes: notes.trim() || null,
      done: editing?.done || false,
      done_at: editing?.done_at || null,
      repeat,
      next_due: isRepeating ? dueDate || null : null,
      due_date: !isRepeating ? dueDate || null : null,
      assigned_to: assignedTo,
      position:
        editing?.position ?? listItems.filter((i) => i.list_id === list.id).length
    };
    if (editing) {
      updateListItem(editing.id, payload);
    } else {
      addListItem(payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editing) return;
    deleteListItem(editing.id);
    onClose();
  };

  // For shared lists, allow assigning. For private lists, no need.
  const showAssignee = list.owner_id === null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md sm:max-w-lg max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-display text-xl text-text">
            {editing ? 'Edit item' : 'New item'}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Item"
            autoFocus
            className="w-full px-3 py-3 bg-surface-2 border border-border rounded-md text-text text-lg font-medium placeholder:text-text-faint focus:outline-none focus:border-accent"
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
          />

          {/* Repeat */}
          <div>
            <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
              <Repeat size={14} /> Repeat
            </div>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as ListItemRepeat)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
            >
              {REPEAT_OPTIONS.map((opt) => (
                <option key={opt.v} value={opt.v}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Due date */}
          <div>
            <div className="text-sm text-text-muted mb-2">
              {repeat === 'never' ? 'Due date (optional)' : 'Next due'}
            </div>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
            />
          </div>

          {/* Assignee (shared lists only) */}
          {showAssignee && (
            <div>
              <div className="text-sm text-text-muted mb-2">Assigned to</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setAssignedTo(null)}
                  className={
                    'px-3 py-1.5 rounded-full border text-xs transition-colors ' +
                    (assignedTo === null
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  Anyone
                </button>
                {members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setAssignedTo(m.id)}
                    className={
                      'flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border transition-colors ' +
                      (assignedTo === m.id
                        ? 'border-accent bg-surface-2'
                        : 'border-border opacity-70 hover:opacity-100')
                    }
                  >
                    <Avatar member={m} size={22} />
                    <span className="text-xs text-text">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border shrink-0 bg-surface">
          {editing ? (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-text-muted hover:text-accent text-sm transition-colors"
            >
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
