const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const dayKey = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
export function dayLabel(iso) {
  const d = new Date(iso), n = new Date(), y = new Date();
  y.setDate(n.getDate() - 1);
  if (same(d, n)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}
export const listTime = (iso) => (same(new Date(iso), new Date()) ? clock(iso) : dayLabel(iso));
export const fullTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'full', timeStyle: 'medium' });
export const minKey = (iso) => { const d = new Date(iso); return dayKey(iso) + '-' + d.getHours() + ':' + d.getMinutes(); };
