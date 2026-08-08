// Small, dependency-free date helpers for the YYYY-MM-DD date picker.
// (Avoids Intl, which Hermes only partially supports.)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local-time "today" as YYYY-MM-DD. */
export function todayISO(): string {
  return toISO(new Date());
}

/** Shift a YYYY-MM-DD string by `days` (can be negative). */
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISO(dt);
}

/** Friendly label: "Today" / "Yesterday" / "Wed 18 Jun". */
export function formatDayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === shiftISO(today, 1)) return 'Tomorrow';
  if (iso === shiftISO(today, -1)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d} ${MONTHS[dt.getMonth()]}`;
}
