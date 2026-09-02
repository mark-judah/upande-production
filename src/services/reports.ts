import { api } from '@/src/services/api';

export interface StemLengthRow { stemLength: string; stems: number; }
export interface VarietyRow { variety: string; stems: number; stemLengths: StemLengthRow[]; }
export interface FarmRow { farm: string; stems: number; varieties: VarietyRow[]; }
export interface HarvestReport {
  date: string;
  totalStems: number;
  farms: FarmRow[];
  /** Received (Receiving stock entries) breakdown for the same date/farm. */
  receivedTotalStems: number;
  receivedFarms: FarmRow[];
}

type RawFarm = {
  farm?: string;
  stems?: number;
  varieties?: Array<{
    variety?: string;
    stems?: number;
    stem_lengths?: Array<{ stem_length?: string; stems?: number }>;
  }>;
};

interface RawReport {
  data?: {
    date?: string;
    total_stems?: number;
    farms?: RawFarm[];
    received_total_stems?: number;
    received_farms?: RawFarm[];
    error?: string;
  };
}

export const reportsApi = {
  /** Harvest broken down by farm → variety → stem length for a single day. */
  async harvestReport(date: string, farm?: string): Promise<HarvestReport> {
    const body = await api<RawReport>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionHarvestReport',
      data: { date, ...(farm ? { farm } : {}) },
    });
    const mapFarms = (raw: RawFarm[] | undefined): FarmRow[] =>
      (raw ?? []).map((f) => ({
        farm: String(f.farm ?? 'Unspecified'),
        stems: Number(f.stems ?? 0),
        varieties: (f.varieties ?? []).map((v) => ({
          variety: String(v.variety ?? 'Unspecified'),
          stems: Number(v.stems ?? 0),
          stemLengths: (v.stem_lengths ?? []).map((sl) => ({
            stemLength: String(sl.stem_length ?? 'Unspecified'),
            stems: Number(sl.stems ?? 0),
          })),
        })),
      }));
    return {
      date: String(body.data?.date ?? date),
      totalStems: Number(body.data?.total_stems ?? 0),
      farms: mapFarms(body.data?.farms),
      receivedTotalStems: Number(body.data?.received_total_stems ?? 0),
      receivedFarms: mapFarms(body.data?.received_farms),
    };
  },
};
