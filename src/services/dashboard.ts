import { api } from './api';

/**
 * Home dashboard data — harvested vs received, the way the farm actually
 * measures a day. Backed by the `get_production_dashboard_data` Server
 * Script already live on Kaitet (see backend/server_scripts/scripts/
 * "Production Dashboard API.json" for the checked-in mirror — the deployed
 * version is newer than that file; this client follows the deployed shape).
 */

export interface DashboardKpi {
  harvested: number;
  received: number;
  recvVariance: number;
  goodStems: number;
  quarantined: number;
  quarantineAccepted: number;
  quarantinePending: number;
  quarantineRejects: number;
  packhouseRejects: number;
}

export interface DashboardGreenhouse {
  greenhouse: string;
  greenhouseName: string;
  farm: string;
  harvested: number;
  received: number;
  variance: number;
  goodStems: number;
  totalRejects: number;
  rejectPct: number;
  budget: number;
  budgetAchievementPct: number;
}

export interface DashboardVariety {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  harvested: number;
  received: number;
  quarantined: number;
  quarantineRejects: number;
}

export interface UnreceivedGreenhouse {
  greenhouse: string;
  greenhouseName: string;
  harvestedStems: number;
  receivedStems: number;
  varianceStems: number;
  agingMinutes: number;
}

export interface UnreceivedFarm {
  farm: string;
  totalVariance: number;
  greenhouses: UnreceivedGreenhouse[];
}

export interface DashboardData {
  fromDate: string;
  toDate: string;
  farm: string;
  kpi: DashboardKpi;
  greenhouseData: DashboardGreenhouse[];
  topVarieties: DashboardVariety[];
  unreceived: {
    totalVarianceStems: number;
    netVarianceStems: number;
    totalGreenhouses: number;
    totalFarms: number;
    tree: UnreceivedFarm[];
  };
}

interface RawGreenhouse {
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
}

interface RawVariety {
  item_code?: string;
  item_name?: string;
  item_group?: string;
  harvested?: number;
  received?: number;
  quarantined?: number;
  quarantine_rejects?: number;
}

interface RawUnreceivedGreenhouse {
  greenhouse?: string;
  greenhouse_name?: string;
  harvested_stems?: number;
  received_stems?: number;
  variance_stems?: number;
  aging_minutes?: number;
}

interface RawResponse {
  message?: {
    from_date?: string;
    to_date?: string;
    farm?: string;
    kpi?: Record<string, number>;
    greenhouse_data?: RawGreenhouse[];
    top_varieties?: RawVariety[];
    unreceived_buckets?: {
      summary?: {
        total_variance_stems?: number;
        net_variance_stems?: number;
        total_greenhouses?: number;
        total_farms?: number;
      };
      tree?: Array<{
        farm?: string;
        total_variance?: number;
        greenhouses?: RawUnreceivedGreenhouse[];
      }>;
    };
    error?: string;
  };
  error?: string;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export const dashboardApi = {
  /** Today's harvested-vs-received rollup, every greenhouse. */
  async fetch(): Promise<DashboardData> {
    const today = new Date().toISOString().slice(0, 10);
    const body = await api<RawResponse>({
      method: 'POST',
      url: '/api/method/get_production_dashboard_data',
      data: { from_date: today, to_date: today },
    });
    const m = body.message ?? {};
    const k = m.kpi ?? {};
    const ub = m.unreceived_buckets ?? {};
    const summary = ub.summary ?? {};

    return {
      fromDate: String(m.from_date ?? today),
      toDate: String(m.to_date ?? today),
      farm: String(m.farm ?? 'All Farms'),
      kpi: {
        harvested: n(k.harvested),
        received: n(k.received),
        recvVariance: n(k.recv_variance),
        goodStems: n(k.good_stems),
        quarantined: n(k.quarantined),
        quarantineAccepted: n(k.quarantine_accepted),
        quarantinePending: n(k.quarantine_pending),
        quarantineRejects: n(k.quarantine_rejects),
        packhouseRejects: n(k.packhouse_rejects),
      },
      greenhouseData: (m.greenhouse_data ?? []).map((g) => ({
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
      })),
      topVarieties: (m.top_varieties ?? []).map((v) => ({
        itemCode: String(v.item_code ?? ''),
        itemName: String(v.item_name ?? v.item_code ?? ''),
        itemGroup: String(v.item_group ?? ''),
        harvested: n(v.harvested),
        received: n(v.received),
        quarantined: n(v.quarantined),
        quarantineRejects: n(v.quarantine_rejects),
      })),
      unreceived: {
        totalVarianceStems: n(summary.total_variance_stems),
        netVarianceStems: n(summary.net_variance_stems),
        totalGreenhouses: n(summary.total_greenhouses),
        totalFarms: n(summary.total_farms),
        tree: (ub.tree ?? []).map((f) => ({
          farm: String(f.farm ?? 'Unassigned'),
          totalVariance: n(f.total_variance),
          greenhouses: (f.greenhouses ?? []).map((g) => ({
            greenhouse: String(g.greenhouse ?? ''),
            greenhouseName: String(g.greenhouse_name ?? g.greenhouse ?? ''),
            harvestedStems: n(g.harvested_stems),
            receivedStems: n(g.received_stems),
            varianceStems: n(g.variance_stems),
            agingMinutes: n(g.aging_minutes),
          })),
        })),
      },
    };
  },

  /** Per-variety harvested/received + missing-bucket detail for one greenhouse, one date. */
  async fetchGreenhouseBreakdown(greenhouse: string, date?: string): Promise<GreenhouseVarietyRow[]> {
    const body = await api<RawGreenhouseBreakdown>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionGreenhouseVarietyBreakdown',
      data: { greenhouse, date: date ?? new Date().toISOString().slice(0, 10) },
    });
    const d = body.data ?? {};
    return (d.varieties ?? []).map((v) => ({
      variety: String(v.variety ?? ''),
      harvested: n(v.harvested),
      received: n(v.received),
      variance: n(v.variance),
      missingBuckets: (v.missing_buckets ?? []).map((b) => ({
        bucketId: String(b.bucket_id ?? ''),
        harvestedQty: n(b.harvested_qty),
        receivedQty: n(b.received_qty),
        variance: n(b.variance),
        agingMinutes: n(b.aging_minutes),
      })),
    }));
  },
};

export interface MissingBucket {
  bucketId: string;
  harvestedQty: number;
  receivedQty: number;
  variance: number;
  agingMinutes: number;
}

export interface GreenhouseVarietyRow {
  variety: string;
  harvested: number;
  received: number;
  variance: number;
  missingBuckets: MissingBucket[];
}

interface RawGreenhouseBreakdown {
  data?: {
    date?: string;
    greenhouse?: string;
    varieties?: Array<{
      variety?: string;
      harvested?: number;
      received?: number;
      variance?: number;
      missing_buckets?: Array<{
        bucket_id?: string;
        harvested_qty?: number;
        received_qty?: number;
        variance?: number;
        aging_minutes?: number;
      }>;
    }>;
    error?: string;
  };
}
