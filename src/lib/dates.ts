/** YYYY-MM-DD in the user's local timezone. */
export function localISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD for n days before today in local time. Negative n = future. */
export function localISODaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}
