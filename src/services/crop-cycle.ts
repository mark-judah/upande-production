import { api } from './api';

export interface CropCycle {
  name: string;
  greenhouse: string;
  farm: string;
  beds: number;
  bays: number;
  varieties: number;
  area: number;
  plants: number;
  // legacy (old model) — optional, retained so the uproot/replant sheets still compile
  startBed?: number;
  endBed?: number;
  bedWidth?: number;
  variety?: string;
  varietyYield?: number;
  plantingDate?: string;
  cycleEndDate?: string;
  expectedProductionDate?: string;
}

export interface NewPlantingPayload {
  greenhouse: string;
  start_bed: number;
  end_bed: number;
  bed_width: number;
  area: number;
  variety: string;
  variety_yield?: number;
  planting_date: string;
  cycle_end_date?: string;
  expected_production_date?: string;
}

export interface UprootPayload {
  crop_cycle: string;
  uproot_date: string;
  from_bed: number;
  to_bed: number;
  qty_uprooted: number;
  reason: string;
  notes?: string;
}

export const UPROOT_REASONS = [
  'End of Life',
  'Disease',
  'Low Yield',
  'Storm Damage',
  'Variety Change',
  'Soil Issue',
  'Other',
] as const;

export interface ReplantPayload {
  crop_cycle: string;
  uproot_record?: string;
  replanting_date: string;
  from_bed: number;
  to_bed: number;
  new_variety: string;
  qty_uprooted: number;
  qty_replanted: number;
  cost_per_plant?: number;
  source_type?: 'Propagation Batch' | 'Purchase Order';
  propagation_batch?: string;
  purchase_order?: string;
  reason: string;
  remarks?: string;
}

export const REPLANT_REASONS = [
  'Low Yield',
  'Disease',
  'Variety Change',
  'End of Life',
  'Storm Damage',
  'Other',
] as const;

export interface PickerOption {
  name: string;
  label: string;
  /** Farm the greenhouse belongs to (when returned by productionListGreenhouseSpecs). */
  farm?: string;
  /** Stock UOM (when returned by productionListVarieties) — a Harvest task's
   *  target is a quantity of this variety, in this unit (e.g. "Stems"). */
  uom?: string;
}

// --- New crop-cycle model (greenhouse-keyed, bed-range configuration) ---
// The Crop Cycle doctype derives varieties_grown, individual_beds and all
// rollups from bed_range on validate(), so the app only submits the header +
// bed ranges. There is no bay table on the doctype.

export interface BedConfigInput {
  from_bed: number;
  to_bed: number;
  qty_planted: number;
  variety: string;
}

export interface NewCropCyclePayload {
  greenhouse: string;
  plants_per_sqm?: number;
  planting_date: string;
  bed_config: BedConfigInput[];
}

interface RawCycle {
  name?: string;
  greenhouse?: string;
  farm?: string;
  beds?: number;
  bays?: number;
  varieties?: number;
  area?: number;
  plants?: number;
  // new model: one cycle = one variety on a bed range
  variety?: string;
  status?: string;
  planting_date?: string;
  start_bed?: number;
  end_bed?: number;
}

function toCycle(r: RawCycle): CropCycle {
  return {
    name: String(r.name ?? ''),
    greenhouse: String(r.greenhouse ?? ''),
    farm: String(r.farm ?? ''),
    beds: Number(r.beds ?? 0),
    bays: Number(r.bays ?? 0),
    varieties: Number(r.varieties ?? 0),
    area: Number(r.area ?? 0),
    plants: Number(r.plants ?? 0),
    variety: r.variety ? String(r.variety) : undefined,
    plantingDate: r.planting_date ? String(r.planting_date) : undefined,
    startBed: r.start_bed ? Number(r.start_bed) : undefined,
    endBed: r.end_bed ? Number(r.end_bed) : undefined,
  };
}

interface ListResponse { data?: { cycles?: RawCycle[]; count?: number; error?: string } }
interface SubmitResponse { data?: { status?: string; name?: string; message?: string; error?: string } }
interface PickerResponse {
  data?: {
    greenhouses?: PickerOption[];
    varieties?: PickerOption[];
    farms?: PickerOption[];
    companies?: PickerOption[];
    reasons?: PickerOption[];
    error?: string;
  };
}

export const cropCycleApi = {
  async list(
    filters?: { greenhouse?: string; variety?: string; farm?: string; limit?: number },
  ): Promise<CropCycle[]> {
    const body = await api<ListResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListCropCycles',
      data: filters ?? {},
    });
    return (body.data?.cycles ?? []).map(toCycle);
  },

  async createPlanting(payload: NewPlantingPayload): Promise<{ name: string; message: string }> {
    const body = await api<SubmitResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionCreateCropCycle',
      data: payload,
    });
    return { name: body.data?.name ?? '', message: body.data?.message ?? '' };
  },

  async createCycle(
    payload: NewCropCyclePayload,
  ): Promise<{ name: string; message: string; beds: number; varieties: number }> {
    const body = await api<SubmitResponse & { data?: { beds?: number; varieties?: number } }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionCreateCropCycle',
      data: payload,
    });
    return {
      name: body.data?.name ?? '',
      message: body.data?.message ?? '',
      beds: body.data?.beds ?? 0,
      varieties: body.data?.varieties ?? 0,
    };
  },

  async recordUproot(payload: UprootPayload): Promise<{ name: string; message: string }> {
    const body = await api<SubmitResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionRecordUproot',
      data: payload,
    });
    return { name: body.data?.name ?? '', message: body.data?.message ?? '' };
  },

  async recordReplant(payload: ReplantPayload): Promise<{ name: string; message: string }> {
    const body = await api<SubmitResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionRecordReplant',
      data: payload,
    });
    return { name: body.data?.name ?? '', message: body.data?.message ?? '' };
  },

  async listGreenhouses(opts?: { search?: string; farm?: string }): Promise<PickerOption[]> {
    // productionListGreenhouses matched warehouses by a "name contains GH"
    // heuristic, which misses/mismatches real greenhouses. The Greenhouse
    // Specs screen resolves greenhouses correctly — Warehouse records with
    // warehouse_type == "Greenhouse" — so pickers use that same endpoint.
    const body = await api<PickerResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListGreenhouseSpecs',
      data: { search: opts?.search ?? '', farm: opts?.farm ?? '', limit: 300 },
    });
    return body.data?.greenhouses ?? [];
  },

  async listVarieties(search?: string): Promise<PickerOption[]> {
    const body = await api<PickerResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListVarieties',
      data: { search: search ?? '', limit: 300 },
    });
    return body.data?.varieties ?? [];
  },

  async listFarms(search?: string): Promise<PickerOption[]> {
    const body = await api<PickerResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListFarms',
      data: { search: search ?? '', limit: 200 },
    });
    return body.data?.farms ?? [];
  },

  async listCompanies(search?: string): Promise<PickerOption[]> {
    const body = await api<PickerResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListCompanies',
      data: { search: search ?? '', limit: 200 },
    });
    return body.data?.companies ?? [];
  },

  async listRejectionReasons(): Promise<PickerOption[]> {
    const body = await api<PickerResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListRejectionReasons',
      data: { limit: 200 },
    });
    return body.data?.reasons ?? [];
  },
};
