import { useEffect, useMemo, useState } from 'react';
import { Trash2, Search, X } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { COLOR_OPTIONS, MEMBER_COLORS } from '@/lib/colors';
import { ICON_OPTIONS, ICON_CATEGORIES } from '@/lib/listIcons';
import { Modal } from './Modal';
import type { TodoList, MemberColor } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: TodoList | null;
}

export function ListEditor({ open, onClose, editing }: Props) {
  const { activeMember, members, addList, updateList, deleteList } = useFamily();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('ListChecks');
  const [color, setColor] = useState<MemberColor | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [iconQuery, setIconQuery] = useState('');

  // Only re-init when the editor opens or the target list changes.
  // activeMember is intentionally excluded — its reference flips on every
  // family-context sync, which would otherwise wipe the form mid-edit.
   
  useEffect(() => {
    if (!open) return;
    setIconQuery('');
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
  }, [open, editing?.id]);

  // Group icons by category, or flatten to a single filtered set when searching.
  const iconGroups = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    if (q) {
      const matches = ICON_OPTIONS.filter(
        (o) => o.keywords.includes(q) || o.category.toLowerCase().includes(q),
      );
      return matches.length ? [{ category: 'Results', icons: matches }] : [];
    }
    return ICON_CATEGORIES.map((category) => ({
      category,
      icons: ICON_OPTIONS.filter((o) => o.category === category),
    }));
  }, [iconQuery]);


  const handleSave = () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      icon,
      color,
      owner_id: ownerId,
      archived: false,
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
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit list' : 'New list'}
      maxWidth="lg"
      footer={
        <>
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
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-5 py-2 bg-accent-strong text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </>
      }
    >
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
                className="w-full mt-2 px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
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
            <div className="relative mb-2">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none"
              />
              <input
                type="text"
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder="Search icons…"
                className="w-full pl-9 pr-9 py-2 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
              />
              {iconQuery && (
                <button
                  onClick={() => setIconQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-text-faint hover:text-text"
                  title="Clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto pr-1 -mr-1">
              {iconGroups.length === 0 ? (
                <div className="text-xs text-text-faint text-center py-8">
                  No icons match “{iconQuery}”.
                </div>
              ) : (
                iconGroups.map((group) => (
                  <div key={group.category} className="mb-3 last:mb-0">
                    <div className="text-[11px] uppercase tracking-wider text-text-faint px-0.5 mb-1.5">
                      {group.category}
                    </div>
                    <div className="grid grid-cols-6 gap-1.5">
                      {group.icons.map((opt) => (
                        <button
                          key={opt.name}
                          onClick={() => setIcon(opt.name)}
                          title={opt.name}
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
                ))
              )}
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
    </Modal>
  );
}
