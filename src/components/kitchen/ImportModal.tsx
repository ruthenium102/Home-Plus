import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Recipe } from '@/types';

interface Props {
  onImport: (partial: Partial<Recipe>) => void;
  onClose: () => void;
}

export function ImportModal({ onImport, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/import-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: { ok: boolean; recipe?: Partial<Recipe>; error?: string };
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        const preview = text.slice(0, 100).replace(/<[^>]+>/g, '').trim() || `HTTP ${res.status}`;
        throw new Error(`API returned non-JSON (${res.status}): ${preview}`);
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Import failed (${res.status})`);
      }

      onImport(data.recipe!);
    } catch (err) {
      setError((err as Error).message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display text-xl text-text">Import from URL</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X size={20} />
          </button>
        </div>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.bbcgoodfood.com/recipes/..."
          className="input w-full mb-3"
          onKeyDown={(e) => { if (e.key === 'Enter' && url && !loading) handleImport(); }}
          autoFocus
        />

        {error && (
          <div className="text-sm text-red-600 mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
            {error}
          </div>
        )}

        <p className="text-xs text-text-faint mb-4">
          Extracts structured recipe data automatically. Uses AI as fallback for sites without it (requires ANTHROPIC_API_KEY).
        </p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={handleImport}
            disabled={!url.trim() || loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
