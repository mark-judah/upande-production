import { api } from './api';

export interface GreenhouseListItem {
  name: string;
  label: string;
  farm: string;
  hasCycle: boolean;
  totalBeds: number;
  totalArea: number;
  varietyCount: number;
}

export interface VarietyRow {
  variety: string;
  beds: number;
  area: number;
  plants: number;
}

export interface BayRow {
  bayNumber: number;
  bayName: string;
  startBed: number;
  endBed: number;
  primaryVariety: string;
  beds: number;
  area: number;
}

export interface Grower {
  employee: string;
  employeeName: string;
  designation: string;
}

/** Per-status rollup of the Greenhouse bed ledger (Planted / Uprooted / …). */
export interface BedStatusRow {
  status: string;
  beds: number;
  plants: number;
  area: number;
}

export interface GreenhouseSpec {
  name: string;
  label: string;
  farm: string;
  hasCycle: boolean;
  totalBeds: number;
  totalPlantedArea: number;
  numberOfPlants: number;
  varietyCount: number;
  varieties: VarietyRow[];
  bedSummary: BedStatusRow[];
  bays: BayRow[];
  growers: Grower[];
}

export interface GrowerCandidate {
  employee: string;
  employeeName: string;
}

interface ListResponse {
  data?: { count?: number; greenhouses?: unknown[] };
}
interface SpecResponse {
  data?: Record<string, unknown>;
}
interface CandidatesResponse {
  data?: { count?: number; candidates?: unknown[] };
}
interface SetGrowerResponse {
  data?: { status?: string; message?: string };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toListItem(r: any): GreenhouseListItem {
  return {
    name: r?.name ?? '',
    label: r?.label ?? r?.name ?? '',
    farm: r?.farm ?? '',
    hasCycle: !!r?.has_cycle,
    totalBeds: num(r?.total_beds),
    totalArea: num(r?.total_area),
    varietyCount: num(r?.variety_count),
  };
}

function toSpec(d: any): GreenhouseSpec {
  return {
    name: d?.name ?? '',
    label: d?.label ?? d?.name ?? '',
    farm: d?.farm ?? '',
    hasCycle: !!d?.has_cycle,
    totalBeds: num(d?.total_beds),
    totalPlantedArea: num(d?.total_planted_area),
    numberOfPlants: num(d?.number_of_plants),
    varietyCount: num(d?.variety_count),
    varieties: (d?.varieties ?? []).map((v: any) => ({
      variety: v?.variety ?? '',
      beds: num(v?.beds),
      area: num(v?.area_m2),
      plants: num(v?.plants),
    })),
    bedSummary: (d?.bed_summary ?? []).map((b: any) => ({
      status: b?.status ?? '',
      beds: num(b?.beds),
      plants: num(b?.plants),
      area: num(b?.area_m2),
    })),
    bays: (d?.bays ?? []).map((b: any) => ({
      bayNumber: num(b?.bay_number),
      bayName: b?.bay_name ?? '',
      startBed: num(b?.start_bed),
      endBed: num(b?.end_bed),
      primaryVariety: b?.primary_variety ?? '',
      beds: num(b?.beds),
      area: num(b?.area_m2),
    })),
    growers: (d?.growers ?? []).map((g: any) => ({
      employee: g?.employee ?? '',
      employeeName: g?.employee_name ?? g?.employee ?? '',
      designation: g?.designation ?? '',
    })),
  };
}

export const greenhouseSpecApi = {
  async list(opts?: { farm?: string; search?: string }): Promise<GreenhouseListItem[]> {
    const body = await api<ListResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListGreenhouseSpecs',
      data: { farm: opts?.farm ?? '', search: opts?.search ?? '', limit: 500 },
    });
    return (body.data?.greenhouses ?? []).map(toListItem);
  },

  async get(greenhouse: string): Promise<GreenhouseSpec> {
    const body = await api<SpecResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionGetGreenhouseSpec',
      data: { greenhouse },
    });
    return toSpec(body.data ?? {});
  },

  /** Fetch specs for several greenhouses at once (the endpoint itself only
   *  takes one `greenhouse`, so this fans out in parallel). Used by the
   *  multi-greenhouse selection on the Greenhouse Specs screen. */
  async getMany(greenhouses: string[]): Promise<GreenhouseSpec[]> {
    return Promise.all(greenhouses.map((g) => greenhouseSpecApi.get(g)));
  },

  async listGrowerCandidates(search?: string): Promise<GrowerCandidate[]> {
    const body = await api<CandidatesResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListGrowerCandidates',
      data: { search: search ?? '', limit: 50 },
    });
    return (body.data?.candidates ?? []).map((c: any) => ({
      employee: c?.employee ?? '',
      employeeName: c?.employee_name ?? c?.employee ?? '',
    }));
  },

  async setGrower(
    employee: string,
    greenhouse: string,
    action: 'add' | 'remove',
  ): Promise<{ status: string; message?: string }> {
    const body = await api<SetGrowerResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionSetGreenhouseGrower',
      data: { employee, greenhouse, action },
    });
    return { status: body.data?.status ?? '', message: body.data?.message };
  },
};
