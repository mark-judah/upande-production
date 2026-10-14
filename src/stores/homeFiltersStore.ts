import { create } from 'zustand';
import {
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  getISOWeeksInYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
} from 'date-fns';
import { storage, StorageKeys } from '@/src/services/storage';
import { api, mapAxiosError } from '@/src/services/api';
import { useDashboardStore } from '@/src/stores/dashboardStore';
import type { DashboardData, DashboardGreenhouse, DashboardKpi, DashboardVariety } from '@/src/services/dashboard';

/**
 * Home-tab filter state — farm, greenhouse, date and week — plus the glue
 * that re-fetches the production dashboard for the active date/week range
 * and writes the (optionally farm/greenhouse-narrowed) result straight into
 * `useDashboardStore`, which `AgricultureDashboard` already renders from.
 * That keeps AgricultureDashboard.tsx and dashboardStore.ts untouched: this
 * store is the only thing that knows filters exist.
 *
 * Data sources — no new fetches are invented here:
 *  - Farm / greenhouse OPTIONS come from `useCropCycleStore` (farms,
 *    greenhouses — already fetched by `loadPickers()` for the Crop Cycle
 *    screen). Each greenhouse option carries the `farm` it belongs to, which
 *    is how the greenhouse picker cascades off the selected farm(s), the
 *    same relationship the Crop Cycle filters screen uses.
 *  - Dashboard VALUES (kpi/greenhouseData/topVarieties) come from the same
 *    `get_production_dashboard_data` endpoint `dashboardApi.fetch()` already
 *    calls — just with `from_date`/`to_date` driven by the date/week filter
 *    instead of being hardcoded to "today" (see backend/server_scripts/
 *    scripts/"Production Dashboard API.json", which already accepts a
 *    date range).
 *
 * Farm/greenhouse scoping is applied CLIENT-SIDE to the fetched
 * `greenhouseData` rows rather than sent to the backend: the deployed
 * endpoint matches `farm`/`greenhouse` by exact equality (single value), so
 * it can't take a multi-select list. Filtering the already-farm/greenhouse
 * tagged rows after the fact supports multi-select without touching the
 * backend. The KPI hero/tiles are left as the server's totals for the
 * queried date range — they include quarantine/packhouse breakdowns that
 * don't exist per-greenhouse-row, so they can't be safely re-aggregated
 * client-side for a farm/greenhouse subset without being misleading.
 *
 * Session boundary: this app's existing "session" artifact is the Frappe
 * session cookie (`storage` key `StorageKeys.cookie`) — it's set fresh on
 * every successful login (incl. the silent re-auth behind biometric unlock)
 * and left untouched by `authStore.hydrate()` on every other app start. So
 * "new session" here is defined the same way: on hydrate, the persisted
 * filters are kept only if the cookie that was active when they were last
 * saved still matches the current one. A changed/missing cookie (fresh
 * login, or a hard "forget device" logout that wipes it) resets filters to
 * their defaults. A soft logout followed by resuming the same cookie
 * (biometric unlock without a full re-login) is not itself a cookie change,
 * so filters survive it too, consistent with "remembered unless it's a new
 * session."
 */

const FILTERS_STORAGE_KEY = 'home_filters_v1';
const FILTERS_SESSION_MARKER_KEY = 'home_filters_session_cookie_v1';

export interface HomeFilterWeek {
  year: number;
  week: number;
}

interface PersistedFilters {
  farms: string[];
  greenhouses: string[];
  date: string | null;
  weeks: HomeFilterWeek[];
}

const DEFAULT_FILTERS: PersistedFilters = { farms: [], greenhouses: [], date: null, weeks: [] };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISODate(): string {
  return toISO(new Date());
}

export function isoWeekOf(d: Date): HomeFilterWeek {
  return { year: getISOWeekYear(d), week: getISOWeek(d) };
}

function isoWeekDates(w: HomeFilterWeek): { startDate: Date; endDate: Date } {
  const anchor = setISOWeek(setISOWeekYear(new Date(), w.year), w.week);
  return { startDate: startOfISOWeek(anchor), endDate: endOfISOWeek(anchor) };
}

function isoWeekRange(w: HomeFilterWeek): { start: string; end: string } {
  const { startDate, endDate } = isoWeekDates(w);
  return { start: toISO(startDate), end: toISO(endDate) };
}

/** The {from_date, to_date} the dashboard query should use for the active
 *  date/week filter. Weeks (when any are picked) win over the single date —
 *  picking weeks is a way to widen the query to a multi-day span, which the
 *  single-date filter can't express. With neither set, defaults to today,
 *  matching the dashboard's original "today only" behaviour. */
function resolveRange(filters: PersistedFilters): { from_date: string; to_date: string } {
  if (filters.weeks.length > 0) {
    const ranges = filters.weeks.map(isoWeekRange);
    const from_date = ranges.reduce((m, r) => (r.start < m ? r.start : m), ranges[0].start);
    const to_date = ranges.reduce((m, r) => (r.end > m ? r.end : m), ranges[0].end);
    return { from_date, to_date };
  }
  const day = filters.date || todayISODate();
  return { from_date: day, to_date: day };
}

/** Selectable ISO weeks for the week filter: the current year in full, plus
 *  the tail of last year and the head of next year so a week near a year
 *  boundary is always reachable without paging. */
export function listWeekOptions(): Array<{ year: number; week: number; label: string }> {
  const thisYear = getISOWeekYear(new Date());
  const out: Array<{ year: number; week: number; label: string }> = [];
  for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
    const count = getISOWeeksInYear(new Date(year, 5, 1));
    const weekList = year === thisYear - 1 ? [count - 3, count - 2, count - 1, count] : null;
    const weeks = year === thisYear + 1 ? [1, 2, 3, 4] : weekList ?? Array.from({ length: count }, (_, i) => i + 1);
    for (const week of weeks) {
      const { startDate, endDate } = isoWeekDates({ year, week });
      out.push({ year, week, label: `Week ${week}, ${year} · ${format(startDate, 'MMM d')}–${format(endDate, 'MMM d')}` });
    }
  }
  return out;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

interface RawDashboardResponse {
  message?: {
    from_date?: string;
    to_date?: string;
    farm?: string;
    kpi?: Record<string, number>;
    greenhouse_data?: Array<{
      greenhouse?: string;
      greenhouse_name?: string;
      farm?: string;
      harvested?: number;
      received?: number;
      variance?: number;
      good_stems?: number;
      total_rejects?: number;
      reject_pct?: number;
      budget?: number;
      budget_achievement_pct?: number;
    }>;
    top_varieties?: Array<{
      item_code?: string;
      item_name?: string;
      item_group?: string;
      harvested?: number;
      received?: number;
      quarantined?: number;
      quarantine_rejects?: number;
    }>;
    error?: string;
  };
  error?: string;
}

async function fetchDashboardForRange(fromDate: string, toDate: string): Promise<DashboardData> {
  const body = await api<RawDashboardResponse>({
    method: 'POST',
    url: '/api/method/get_production_dashboard_data',
    data: { from_date: fromDate, to_date: toDate },
  });
  const m = body.message ?? {};
  const k = m.kpi ?? {};

  const kpi: DashboardKpi = {
    harvested: n(k.harvested),
    received: n(k.received),
    recvVariance: n(k.recv_variance),
    goodStems: n(k.good_stems),
    quarantined: n(k.quarantined),
    quarantineAccepted: n(k.quarantine_accepted),
    quarantinePending: n(k.quarantine_pending),
    quarantineRejects: n(k.quarantine_rejects),
    packhouseRejects: n(k.packhouse_rejects),
  };

  const greenhouseData: DashboardGreenhouse[] = (m.greenhouse_data ?? []).map((g) => ({
    greenhouse: String(g.greenhouse ?? ''),
    greenhouseName: String(g.greenhouse_name ?? g.greenhouse ?? ''),
    farm: String(g.farm ?? 'Unassigned'),
    harvested: n(g.harvested),
    received: n(g.received),
    variance: n(g.variance),
    goodStems: n(g.good_stems),
    totalRejects: n(g.total_rejects),
    rejectPct: n(g.reject_pct),
    budget: n(g.budget),
    budgetAchievementPct: n(g.budget_achievement_pct),
  }));

  const topVarieties: DashboardVariety[] = (m.top_varieties ?? []).map((v) => ({
    itemCode: String(v.item_code ?? ''),
    itemName: String(v.item_name ?? v.item_code ?? ''),
    itemGroup: String(v.item_group ?? ''),
    harvested: n(v.harvested),
    received: n(v.received),
    quarantined: n(v.quarantined),
    quarantineRejects: n(v.quarantine_rejects),
  }));

  return {
    fromDate: String(m.from_date ?? fromDate),
    toDate: String(m.to_date ?? toDate),
    farm: String(m.farm ?? 'All Farms'),
    kpi,
    greenhouseData,
    topVarieties,
    // Not rendered anywhere on the home screen today (see AgricultureDashboard.tsx) —
    // left empty rather than re-deriving a shape nothing reads.
    unreceived: { totalVarianceStems: 0, netVarianceStems: 0, totalGreenhouses: 0, totalFarms: 0, tree: [] },
  };
}

function applyFarmGreenhouseFilter(
  data: DashboardData,
  farms: string[],
  greenhouses: string[],
): DashboardData {
  if (farms.length === 0 && greenhouses.length === 0) return data;
  const farmSet = new Set(farms);
  const ghSet = new Set(greenhouses);
  const greenhouseData = data.greenhouseData.filter((g) => {
    if (farmSet.size > 0 && !farmSet.has(g.farm)) return false;
    if (ghSet.size > 0 && !ghSet.has(g.greenhouse)) return false;
    return true;
  });
  return { ...data, greenhouseData };
}

interface HomeFiltersState extends PersistedFilters {
  hydrated: boolean;
  refreshing: boolean;

  hydrate: () => Promise<void>;
  setFarms: (farms: string[]) => void;
  setGreenhouses: (greenhouses: string[]) => void;
  setDate: (date: string | null) => void;
  setWeeks: (weeks: HomeFilterWeek[]) => void;
  clearAll: () => void;
  refresh: () => Promise<void>;
}

async function persist(filters: PersistedFilters): Promise<void> {
  await storage.set(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  const cookie = await storage.get(StorageKeys.cookie);
  if (cookie) await storage.set(FILTERS_SESSION_MARKER_KEY, cookie);
}

export const useHomeFiltersStore = create<HomeFiltersState>((set, get) => ({
  ...DEFAULT_FILTERS,
  hydrated: false,
  refreshing: false,

  hydrate: async () => {
    try {
      const [raw, sessionMarker, currentCookie] = await Promise.all([
        storage.get(FILTERS_STORAGE_KEY),
        storage.get(FILTERS_SESSION_MARKER_KEY),
        storage.get(StorageKeys.cookie),
      ]);

      const sameSession = !!currentCookie && !!sessionMarker && currentCookie === sessionMarker;

      let restored: PersistedFilters = DEFAULT_FILTERS;
      if (sameSession && raw) {
        try {
          const parsed = JSON.parse(raw);
          restored = {
            farms: Array.isArray(parsed.farms) ? parsed.farms.filter((v: unknown) => typeof v === 'string') : [],
            greenhouses: Array.isArray(parsed.greenhouses)
              ? parsed.greenhouses.filter((v: unknown) => typeof v === 'string')
              : [],
            date: typeof parsed.date === 'string' ? parsed.date : null,
            weeks: Array.isArray(parsed.weeks)
              ? parsed.weeks.filter(
                  (w: unknown): w is HomeFilterWeek =>
                    !!w && typeof (w as HomeFilterWeek).year === 'number' && typeof (w as HomeFilterWeek).week === 'number',
                )
              : [],
          };
        } catch {
          restored = DEFAULT_FILTERS;
        }
      }

      set({ ...restored, hydrated: true });
      // A new session (or first run) starts clean — write that clean state
      // (and the current cookie) back so a stale blob from a previous
      // session can't resurface if the cookie happens to repeat later.
      if (!sameSession) await persist(restored);
    } catch {
      set({ ...DEFAULT_FILTERS, hydrated: true });
    }
  },

  setFarms: (farms) => {
    set({ farms });
    persist({ farms, greenhouses: get().greenhouses, date: get().date, weeks: get().weeks });
    get().refresh();
  },
  setGreenhouses: (greenhouses) => {
    set({ greenhouses });
    persist({ farms: get().farms, greenhouses, date: get().date, weeks: get().weeks });
    get().refresh();
  },
  setDate: (date) => {
    // Picking an explicit date clears any week selection — they're two
    // ways of expressing the same "which day(s)" question.
    set({ date, weeks: [] });
    persist({ farms: get().farms, greenhouses: get().greenhouses, date, weeks: [] });
    get().refresh();
  },
  setWeeks: (weeks) => {
    set({ weeks, date: null });
    persist({ farms: get().farms, greenhouses: get().greenhouses, date: null, weeks });
    get().refresh();
  },
  clearAll: () => {
    set({ ...DEFAULT_FILTERS });
    persist(DEFAULT_FILTERS);
    get().refresh();
  },

  refresh: async () => {
    const { farms, greenhouses, date, weeks } = get();
    set({ refreshing: true });
    useDashboardStore.setState({ loading: true, error: null });
    try {
      const { from_date, to_date } = resolveRange({ farms, greenhouses, date, weeks });
      const data = await fetchDashboardForRange(from_date, to_date);
      useDashboardStore.setState({ data: applyFarmGreenhouseFilter(data, farms, greenhouses), loading: false });
    } catch (err) {
      useDashboardStore.setState({ error: mapAxiosError(err).message, loading: false });
    } finally {
      set({ refreshing: false });
    }
  },
}));
