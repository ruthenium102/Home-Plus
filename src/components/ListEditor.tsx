import { useEffect, useState } from 'react';
import {
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
  ListChecks,
  Home,
  Car,
  Gift,
  Dumbbell,
  BookOpen,
  Gamepad2,
  Music,
  Palette,
  Sparkles,
  PawPrint,
  Baby,
  Flower2,
  TreePine,
  Pill,
  Shirt,
  Salad,
  Carrot,
  Apple,
  Banana,
  Beef,
  Drumstick,
  Fish,
  Soup,
  Pizza,
  Sandwich,
  Egg,
  Cake,
  IceCream,
  Coffee,
  Wine,
  Milk,
  Utensils,
  Croissant,
} from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { COLOR_OPTIONS, MEMBER_COLORS } from '@/lib/colors';
import { Modal } from './Modal';
import type { TodoList, MemberColor } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: TodoList | null;
}

const ICON_OPTIONS = [
  // Tasks & household
  { name: 'ListChecks', Icon: ListChecks },
  { name: 'Home', Icon: Home },
  { name: 'ShoppingBag', Icon: ShoppingBag },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Hammer', Icon: Hammer },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'GraduationCap', Icon: GraduationCap },
  { name: 'Car', Icon: Car },
  { name: 'Plane', Icon: Plane },
  { name: 'CircleUserRound', Icon: CircleUserRound },
  // Food & kitchen
  { name: 'ChefHat', Icon: ChefHat },
  { name: 'Utensils', Icon: Utensils },
  { name: 'Salad', Icon: Salad },
  { name: 'Carrot', Icon: Carrot },
  { name: 'Apple', Icon: Apple },
  { name: 'Banana', Icon: Banana },
  { name: 'Beef', Icon: Beef },
  { name: 'Drumstick', Icon: Drumstick },
  { name: 'Fish', Icon: Fish },
  { name: 'Soup', Icon: Soup },
  { name: 'Pizza', Icon: Pizza },
  { name: 'Sandwich', Icon: Sandwich },
  { name: 'Egg', Icon: Egg },
  { name: 'Croissant', Icon: Croissant },
  { name: 'Cake', Icon: Cake },
  { name: 'IceCream', Icon: IceCream },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Milk', Icon: Milk },
  { name: 'Wine', Icon: Wine },
  // Family & life
  { name: 'Heart', Icon: Heart },
  { name: 'Baby', Icon: Baby },
  { name: 'PawPrint', Icon: PawPrint },
  { name: 'Gift', Icon: Gift },
  { name: 'Dumbbell', Icon: Dumbbell },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Gamepad2', Icon: Gamepad2 },
  { name: 'Music', Icon: Music },
  { name: 'Palette', Icon: Palette },
  { name: 'Shirt', Icon: Shirt },
  { name: 'Pill', Icon: Pill },
  { name: 'Flower2', Icon: Flower2 },
  { name: 'TreePine', Icon: TreePine },
  { name: 'Sparkles', Icon: Sparkles },
];

export function ListEditor({ open, onClose, editing }: Props) {
  const { activeMember, members, addList, updateList, deleteList } = useFamily();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('ListChecks');
  const [color, setColor] = useState<MemberColor | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  // Only re-init when the editor opens or the target list changes.
  // activeMember is intentionally excluded — its reference flips on every
  // family-context sync, which would otherwise wipe the form mid-edit.
   
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
  }, [open, editing?.id]);


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
            <div className="grid grid-cols-5 gap-1.5 max-h-52 overflow-y-auto pr-1">
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
    </Modal>
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
