import { create } from 'zustand';
import { fetchSupportDashboard, type BehindCardWire, type SupportDashboard } from '@/src/services/support-installs';

export type BehindCard = BehindCardWire;

export function filterByVersion(cards: BehindCard[], version: string | null): BehindCard[] {
  return version ? cards.filter((c) => c.app_version === version) : cards;
}

/** Biggest farm first; ties alphabetical; the catch-all "Unknown farm" always last. */
export function groupByFarm(cards: BehindCard[]): { farm: string; cards: BehindCard[] }[] {
  const map = new Map<string, BehindCard[]>();
  for (const c of cards) map.set(c.farm, [...(map.get(c.farm) ?? []), c]);
  return [...map.entries()]
    .map(([farm, list]) => ({ farm, cards: list }))
    .sort((a, b) => {
      if (a.farm === 'Unknown farm') return 1;
      if (b.farm === 'Unknown farm') return -1;
      return b.cards.length - a.cards.length || a.farm.localeCompare(b.farm);
    });
}

export function reasonLabel(reason: string | null, days?: number | null): string {
  switch (reason) {
    case 'needs_apk': return 'Needs new APK';
    case 'missed_ota': return 'Missed update';
    case 'low_storage': return 'Low storage';
    case 'offline': return days != null ? `Offline ${days}d` : 'Offline';
    default: return '';
  }
}

/** wa.me link for a phone number; a leading 0 is read as a Kenyan number. Null when unusable. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith('0') ? `254${digits.slice(1)}` : digits}`;
}

/** One line per device, ready to paste into a chat. */
export function buildCopyText(cards: BehindCard[], latest: string | null): string {
  return cards
    .map((c) => {
      const name = c.user_full_name || c.user || c.device;
      const from = c.app_version ? `v${c.app_version}` : 'unknown version';
      const to = latest ? ` → v${latest}` : '';
      const parts = [c.farm, name, c.phone || '', `${from}${to}`, reasonLabel(c.reason, c.days_since_seen)];
      return parts.filter((p) => p !== '').join(' — ');
    })
    .join('\n');
}

interface State {
  data: SupportDashboard | null;
  loading: boolean;
  error: string | null;
  versionFilter: string | null;
  load: () => Promise<void>;
  setVersionFilter: (v: string | null) => void;
}

export const useSupportInstallsStore = create<State>((set) => ({
  data: null, loading: false, error: null, versionFilter: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ data: await fetchSupportDashboard(), loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Could not load install stats.' });
    }
  },
  setVersionFilter: (v) => set((s) => ({ versionFilter: s.versionFilter === v ? null : v })),
}));
