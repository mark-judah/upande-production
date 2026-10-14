import { create } from 'zustand';
import {
  fetchDevicesOverview, type DevicesOverview, type OverviewDeviceWire, type OverviewPersonWire,
} from '@/src/services/devices-overview';

export type OverviewDevice = OverviewDeviceWire;
export type OverviewPerson = OverviewPersonWire;
export type DeviceRange = 'all' | '7d' | '30d';

const DAY = 86400;

/** "just now", "5m ago", "3h ago", "12d ago"; "never" when the device has not been seen. */
export function relativeTime(secondsAgo: number | null): string {
  if (secondsAgo == null) return 'never';
  if (secondsAgo < 60) return 'just now';
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < DAY) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / DAY)}d ago`;
}

/** Search matches model, device name, user, farm and IP; the range limits by last seen. */
export function filterDevices(devices: OverviewDevice[], search: string, range: DeviceRange): OverviewDevice[] {
  const q = search.trim().toLowerCase();
  const limit = range === '7d' ? 7 * DAY : range === '30d' ? 30 * DAY : null;
  return devices.filter((d) => {
    if (limit != null && (d.seen_seconds_ago == null || d.seen_seconds_ago > limit)) return false;
    if (!q) return true;
    return [d.model, d.device_name, d.user_name, d.farm, d.ip].some((v) => (v ?? '').toLowerCase().includes(q));
  });
}

/** The version pill: green when on the latest, amber when behind. */
export function pillTone(isLatest: boolean): 'success' | 'warn' {
  return isLatest ? 'success' : 'warn';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function peopleSubtitle(p: { model: string | null; device_count: number; sign_ins: number }): string {
  return [p.model, plural(p.device_count, 'device'), plural(p.sign_ins, 'sign-in')].filter(Boolean).join(' · ');
}

export function shortInstallId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—';
}

/** "Itel itel P671L": brand (capitalised) + model, whichever exist. */
export function deviceModelLabel(brand: string | null | undefined, model: string | null | undefined): string {
  const b = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : '';
  return [b, model].filter(Boolean).join(' ') || '—';
}

interface State {
  data: DevicesOverview | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

export const useDevicesStore = create<State>((set) => ({
  data: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ data: await fetchDevicesOverview(), loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Could not load the devices list.' });
    }
  },
}));
