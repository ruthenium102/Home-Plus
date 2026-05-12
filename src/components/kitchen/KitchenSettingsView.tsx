import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function KitchenSettingsView() {
  const { kitchenSettings, updateKitchenSettings } = useFamily();
  const [newItem, setNewItem] = useState('');

  function addCupboardItem() {
    const item = newItem.trim().toLowerCase();
    if (!item) return;
    if (kitchenSettings.cupboard.includes(item)) return;
    updateKitchenSettings({ cupboard: [...kitchenSettings.cupboard, item] });
    setNewItem('');
  }

  function removeCupboardItem(item: string) {
    updateKitchenSettings({ cupboard: kitchenSettings.cupboard.filter((c) => c !== item) });
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="card p-5">
        <h3 className="font-medium text-text mb-1">Cupboard staples</h3>
        <p className="text-xs text-text-faint mb-3">
          Ingredients you always have — excluded from the shopping list.
        </p>

        <div className="flex gap-2 mb-3">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCupboardItem(); }}
            placeholder="e.g. olive oil, salt, garlic"
            className="input flex-1"
          />
          <button onClick={addCupboardItem} className="btn-primary flex items-center gap-1">
            <Plus size={14} />Add
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {kitchenSettings.cupboard.length === 0 ? (
            <p className="text-sm text-text-faint">No cupboard items yet.</p>
          ) : (
            kitchenSettings.cupboard.map((item) => (
              <span
                key={item}
                className="flex items-center gap-1 px-2.5 py-1 bg-surface-2 rounded-full text-sm text-text"
              >
                {item}
                <button
                  onClick={() => removeCupboardItem(item)}
                  className="text-text-faint hover:text-red-500 transition"
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-medium text-text mb-1">Shopping days</h3>
        <p className="text-xs text-text-faint mb-3">
          Used to split the shopping list into two shops.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-faint block mb-1">Main shop day</label>
            <select
              value={kitchenSettings.primary_shop_day ?? ''}
              onChange={(e) => updateKitchenSettings({ primary_shop_day: e.target.value === '' ? null : Number(e.target.value) })}
              className="input w-full"
            >
              <option value="">None</option>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="midweek"
              checked={kitchenSettings.mid_week_shop_enabled}
              onChange={(e) => updateKitchenSettings({ mid_week_shop_enabled: e.target.checked })}
              className="w-4 h-4 accent-accent"
            />
            <label htmlFor="midweek" className="text-sm text-text">Enable mid-week shop</label>
          </div>

          {kitchenSettings.mid_week_shop_enabled && (
            <div>
              <label className="text-xs text-text-faint block mb-1">Mid-week shop day</label>
              <select
                value={kitchenSettings.mid_week_shop_day ?? ''}
                onChange={(e) => updateKitchenSettings({ mid_week_shop_day: e.target.value === '' ? null : Number(e.target.value) })}
                className="input w-full"
              >
                <option value="">None</option>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
