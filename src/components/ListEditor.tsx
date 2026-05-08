import { useEffect, useState } from 'react';
import {
  X,
  Trash2,
  Wrench,
  Hammer,
  GraduationCap,
  CircleUserRound,
  ShoppingBag,
  Briefcase,
  Heart,
  Plane,
  ChefHat,
  ListChecks
} from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { COLOR_OPTIONS, MEMBER_COLORS } from '@/lib/colors';
import type { TodoList, MemberColor } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: TodoList | null;
}

const ICON_OPTIONS = [
  { name: 'ListChecks', Icon: ListChecks },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Hammer', Icon: Hammer },
  { name: 'GraduationCap', Icon: GraduationCap },
  { name: 'CircleUserRound', Icon: CircleUserRound },
  { name: 'ShoppingBag', Icon: ShoppingBag },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Heart', Icon: Heart },
  { name: 'Plane', Icon: Plane },
  { name: 'ChefHat', Icon: ChefHat }
];

export function ListEditor({ open, onClose, editing }: Props) {
  const { activeMember, members, addList, updateList, deleteList } = useFamily();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('ListChecks');
  const [color, setColor] = useState<MemberColor | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setIcon(editing.icon || 'ListChecks');
      setColor(editing.color);
      setOwnerId(editing.owner_id);
    } else {
      setName('');
      setIcon('ListChecks');
      setColor(activeMember?.color || null);
      setOwnerId(null); // shared by default
    }
  }, [open, editing, activeMember]);

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      icon,
      color,
      owner_id: ownerId,
      archived: false
    };
    if (editing) {
      updateList(editing.id, payload);
    } else {
      addList(payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editing) return;
    if (confirm(`Delete "${editing.name}" and all its items?`)) {
      deleteList(editing.id);
      onClose();
    }
  };

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
            {editing ? 'Edit list' : 'New list'}
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name"
            autoFocus
            className="w-full px-3 py-3 bg-surface-2 border border-border rounded-md text-text text-lg font-medium placeholder:text-text-faint focus:outline-none focus:border-accent"
          />

          {/* Privacy */}
          <div>
            <div className="text-sm text-text-muted mb-2">Visibility</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOwnerId(null)}
                className={
                  'p-3 rounded-md border-2 text-sm transition-colors ' +
                  (ownerId === null
                    ? 'border-accent bg-accent-soft text-text'
                    : 'border-border hover:border-border-strong text-text-muted')
                }
              >
                <div className="font-medium">Shared</div>
                <div className="text-xs opacity-70 mt-0.5">Whole family sees it</div>
              </button>
              <button
                onClick={() => setOwnerId(activeMember?.id || null)}
                className={
                  'p-3 rounded-md border-2 text-sm transition-colors ' +
                  (ownerId !== null
                    ? 'border-accent bg-accent-soft text-text'
                    : 'border-border hover:border-border-strong text-text-muted')
                }
              >
                <div className="font-medium">Private</div>
                <div className="text-xs opacity-70 mt-0.5">Only you see it</div>
              </button>
            </div>
            {ownerId !== null && (
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full mt-2 px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Icon */}
          <div>
            <div className="text-sm text-text-muted mb-2">Icon</div>
            <div className="grid grid-cols-5 gap-1.5">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.name}
                  onClick={() => setIcon(opt.name)}
                  className={
                    'aspect-square flex items-center justify-center rounded-md border-2 transition-colors ' +
                    (icon === opt.name
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border hover:border-border-strong text-text-muted')
                  }
                >
                  <opt.Icon size={18} />
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <div className="text-sm text-text-muted mb-2">Colour</div>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  title={c}
                  className={
                    'w-8 h-8 rounded-full transition-transform ' +
                    (color === c ? 'ring-2 ring-text-muted scale-110' : '')
                  }
                  style={{ background: MEMBER_COLORS[c].base }}
                />
              ))}
            </div>
          </div>
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
              disabled={!name.trim()}
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

/**
 * Resolve a list's icon name to its Lucide component.
 * Used by ListsPage and HomePage.
 */
export function getListIcon(iconName: string | null): LucideIconType {
  const found = ICON_OPTIONS.find((o) => o.name === iconName);
  return found?.Icon ?? ListChecks;
}

type LucideIconType = typeof ListChecks;
