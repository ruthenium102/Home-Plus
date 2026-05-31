import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render errors anywhere in the page tree so
 * a single bad render shows a friendly branded fallback instead of a blank
 * white screen. Dependency-free (uses the app's own tokens + lucide), and
 * styled to match the warm cream/terracotta palette in both light and dark.
 *
 * Errors here are unrecoverable for the current tree, so the only action we
 * offer is a full reload — `window.location.reload()` rebuilds the tree from
 * scratch, which is the right hammer for a render-time crash.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No crash-reporting wired up yet (Sentry is a separate effort); log so the
    // stack is at least visible in the device console / Safari web inspector.
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center p-6">
        <div className="card max-w-sm w-full p-8 text-center">
          <div className="text-5xl mb-4">🙃</div>
          <h1 className="font-display text-2xl text-text mb-2">Something went wrong</h1>
          <p className="text-sm text-text-faint mb-6">
            The app hit an unexpected hiccup. Your data is safe — reloading usually sorts it out.
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
          >
            <RefreshCw size={16} />
            Reload
          </button>
        </div>
      </div>
    );
  }
}
