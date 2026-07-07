import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';

// Renders a list's chosen icon WITHOUT statically importing the ~300-icon
// catalog (`lib/listIcons`), which used to ride along in the ListsPage chunk
// and made it the heaviest tab in the app (~145 kB). The catalog now loads as
// one shared async chunk (also used by the ListEditor picker): first paint
// shows a generic placeholder for a frame or two, then every lookup is
// synchronous for the rest of the session.
type Catalog = typeof import('@/lib/listIcons');

let catalog: Catalog | null = null;
let catalogPromise: Promise<Catalog> | null = null;

function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= import('@/lib/listIcons').then((m) => {
    catalog = m;
    return m;
  });
  return catalogPromise;
}

interface Props {
  name: string | null;
  size?: number;
  className?: string;
}

export function ListIcon({ name, size, className }: Props) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!catalog) {
      let alive = true;
      void loadCatalog().then(() => {
        if (alive) bump((n) => n + 1);
      });
      return () => {
        alive = false;
      };
    }
  }, []);
  const Icon = catalog ? catalog.getListIcon(name) : ListChecks;
  return <Icon size={size} className={className} />;
}
