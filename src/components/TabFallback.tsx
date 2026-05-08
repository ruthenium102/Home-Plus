/**
 * Skeleton shown while a tab's code chunk is loading.
 * Quiet, doesn't flash — uses a subtle shimmer.
 */
export function TabFallback() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-12 bg-surface-2 rounded-md" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="h-32 bg-surface-2 rounded-md" />
        <div className="h-32 bg-surface-2 rounded-md" />
        <div className="h-32 bg-surface-2 rounded-md" />
      </div>
    </div>
  );
}
