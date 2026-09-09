import { api } from '@/src/services/api';

export interface StemLengthRow { stemLength: string; stems: number; }
export interface VarietyRow { variety: string; stems: number; stemLengths: StemLengthRow[]; }
export interface FarmRow { farm: string; stems: number; varieties: VarietyRow[]; }
export interface GreenhouseRow { greenhouse: string; stems: number; varieties: VarietyRow[]; }
export interface HarvestReport {
  date: string;
  totalStems: number;
  farms: FarmRow[];
  greenhouses: GreenhouseRow[];
  /** Received (Receiving stock entries) breakdown for the same date/farm. */
  receivedTotalStems: number;
  receivedFarms: FarmRow[];
  receivedGreenhouses: GreenhouseRow[];
}

type RawVariety = {
  variety?: string;
  stems?: number;
  stem_lengths?: Array<{ stem_length?: string; stems?: number }>;
};
type RawFarm = { farm?: string; stems?: number; varieties?: RawVariety[] };
type RawGreenhouse = { greenhouse?: string; stems?: number; varieties?: RawVariety[] };

interface RawReport {
  data?: {
    date?: string;
    total_stems?: number;
    farms?: RawFarm[];
    greenhouses?: RawGreenhouse[];
    received_total_stems?: number;
    received_farms?: RawFarm[];
    received_greenhouses?: RawGreenhouse[];
    error?: string;
  };
}

const mapVarieties = (raw: RawVariety[] | undefined): VarietyRow[] =>
  (raw ?? []).map((v) => ({
    variety: String(v.variety ?? 'Unspecified'),
    stems: Number(v.stems ?? 0),
    stemLengths: (v.stem_lengths ?? []).map((sl) => ({
      stemLength: String(sl.stem_length ?? 'Unspecified'),
      stems: Number(sl.stems ?? 0),
    })),
  }));

export const reportsApi = {
  /** Harvest broken down by farm/greenhouse → variety → stem length for a single day. */
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
        varieties: mapVarieties(f.varieties),
      }));
    const mapGreenhouses = (raw: RawGreenhouse[] | undefined): GreenhouseRow[] =>
      (raw ?? []).map((g) => ({
        greenhouse: String(g.greenhouse ?? 'Unspecified'),
        stems: Number(g.stems ?? 0),
        varieties: mapVarieties(g.varieties),
      }));
    return {
      date: String(body.data?.date ?? date),
      totalStems: Number(body.data?.total_stems ?? 0),
      farms: mapFarms(body.data?.farms),
      greenhouses: mapGreenhouses(body.data?.greenhouses),
      receivedTotalStems: Number(body.data?.received_total_stems ?? 0),
      receivedFarms: mapFarms(body.data?.received_farms),
      receivedGreenhouses: mapGreenhouses(body.data?.received_greenhouses),
    };
  },
};
