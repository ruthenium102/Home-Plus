import { ChefHat, type LucideIcon } from 'lucide-react';

interface PlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  bullets: string[];
}

function Placeholder({ title, description, icon: Icon, bullets }: PlaceholderProps) {
  return (
    <div className="card p-8 sm:p-12 text-center max-w-2xl mx-auto">
      <div className="w-14 h-14 rounded-full bg-accent-soft mx-auto mb-4 flex items-center justify-center text-accent">
        <Icon size={26} />
      </div>
      <h2 className="font-display text-2xl text-text mb-2">{title}</h2>
      <p className="text-text-muted mb-6 leading-relaxed">{description}</p>

      <div className="text-left bg-surface-2 rounded-md p-4 max-w-md mx-auto">
        <div className="text-xs uppercase tracking-wider text-text-faint mb-2">
          Coming in this tab
        </div>
        <ul className="space-y-1.5">
          {bullets.map((b) => (
            <li key={b} className="text-sm text-text flex gap-2">
              <span className="text-accent">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 text-xs text-text-faint">
        We'll wire this up in the next phase.
      </div>
    </div>
  );
}

export function KitchenPage() {
  return (
    <Placeholder
      title="Kitchen Plus"
      description="The full Kitchen Plus app slots in here — recipes, meal plan, shopping list, cupboard. After the merge, family members and dietary preferences sync from this app."
      icon={ChefHat}
      bullets={[
        'Migrate KP Supabase tables into this project',
        'KP routes become components inside this tab',
        'Meal plan reads family member dietary prefs',
        'Shopping list items can be assigned as a chore',
        'Planned meals appear on the family calendar'
      ]}
    />
  );
}
