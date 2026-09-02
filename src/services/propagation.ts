import { api } from './api';

export const PROPAGATION_STAGES = [
  'Cutting',
  'Sticking',
  'Callusing',
  'Rooting',
  'Nursery',
  'Hardening',
  'Ready for Dispatch',
] as const;
export type PropagationStage = (typeof PROPAGATION_STAGES)[number];

export const LOG_ACTIVITIES = [
  'Cutting',
  'Sticking',
  'Germination Count',
  'Nursery Count',
  'Hardening Count',
  'Mortality Audit',
  'Dispatch',
] as const;
export type LogActivity = (typeof LOG_ACTIVITIES)[number];

export const SR_STATUSES = [
  'Draft',
  'Submitted',
  'In Progress',
  'Partially Fulfilled',
  'Fulfilled',
  'Cancelled',
] as const;
export type SeedlingRequestStatus = (typeof SR_STATUSES)[number];

export const SR_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
export type SeedlingRequestPriority = (typeof SR_PRIORITIES)[number];

export const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Rainy', 'Hot', 'Cold', 'Humid'] as const;

export interface PropagationBatch {
  name: string;
  variety: string;
  varietyName: string;
  propagationMethod: string;
  currentStage: string;
  isoWeek: number;
  isoYear: number;
  startDate: string;
  totalCuttingsPlanned: number;
  totalCuttingsActual: number;
  totalMortality: number;
  totalSurvived: number;
  availableToDispatch: number;
  totalDispatched: number;
  successRate: number;
  propagationUnit: string;
  company: string;
}

export interface PropagationLogPayload {
  propagation_batch: string;
  log_date: string;
  activity_type: LogActivity;
  qty_done_today: number;
  mortality_today?: number;
  surviving_qty?: number;
  weather_conditions?: string;
  observations?: string;
}

export interface SeedlingRequest {
  name: string;
  status: string;
  requestDate: string;
  requiredByDate: string;
  priority: string;
  farm: string;
  targetFarmBlock: string;
  totalQtyRequested: number;
  totalQtyDispatched: number;
  fulfilmentPercentage: number;
  daysToFulfil: number;
  reason: string;
  requestedBy: string;
}

export interface SeedlingRequestItem {
  variety: string;
  qty: number;
  stem_length?: string;
}

export interface SeedlingRequestPayload {
  required_by_date: string;
  priority?: SeedlingRequestPriority;
  farm?: string;
  target_farm_block?: string;
  reason?: string;
  items: SeedlingRequestItem[];
}

interface RawBatch {
  name?: string;
  variety?: string;
  variety_name?: string;
  propagation_method?: string;
  current_stage?: string;
  iso_week?: number;
  iso_year?: number;
  start_date?: string;
  total_cuttings_planned?: number;
  total_cuttings_actual?: number;
  total_mortality?: number;
  total_survived?: number;
  available_to_dispatch?: number;
  total_dispatched?: number;
  success_rate?: number;
  propagation_unit?: string;
  company?: string;
}

interface RawSeedlingRequest {
  name?: string;
  status?: string;
  request_date?: string;
  required_by_date?: string;
  priority?: string;
  farm?: string;
  target_farm_block?: string;
  total_qty_requested?: number;
  total_qty_dispatched?: number;
  fulfilment_percentage?: number;
  days_to_fulfil?: number;
  reason?: string;
  requested_by?: string;
}

function toBatch(r: RawBatch): PropagationBatch {
  return {
    name: String(r.name ?? ''),
    variety: String(r.variety ?? ''),
    varietyName: String(r.variety_name ?? ''),
    propagationMethod: String(r.propagation_method ?? ''),
    currentStage: String(r.current_stage ?? ''),
    isoWeek: Number(r.iso_week ?? 0),
    isoYear: Number(r.iso_year ?? 0),
    startDate: String(r.start_date ?? ''),
    totalCuttingsPlanned: Number(r.total_cuttings_planned ?? 0),
    totalCuttingsActual: Number(r.total_cuttings_actual ?? 0),
    totalMortality: Number(r.total_mortality ?? 0),
    totalSurvived: Number(r.total_survived ?? 0),
    availableToDispatch: Number(r.available_to_dispatch ?? 0),
    totalDispatched: Number(r.total_dispatched ?? 0),
    successRate: Number(r.success_rate ?? 0),
    propagationUnit: String(r.propagation_unit ?? ''),
    company: String(r.company ?? ''),
  };
}

function toRequest(r: RawSeedlingRequest): SeedlingRequest {
  return {
    name: String(r.name ?? ''),
    status: String(r.status ?? ''),
    requestDate: String(r.request_date ?? ''),
    requiredByDate: String(r.required_by_date ?? ''),
    priority: String(r.priority ?? ''),
    farm: String(r.farm ?? ''),
    targetFarmBlock: String(r.target_farm_block ?? ''),
    totalQtyRequested: Number(r.total_qty_requested ?? 0),
    totalQtyDispatched: Number(r.total_qty_dispatched ?? 0),
    fulfilmentPercentage: Number(r.fulfilment_percentage ?? 0),
    daysToFulfil: Number(r.days_to_fulfil ?? 0),
    reason: String(r.reason ?? ''),
    requestedBy: String(r.requested_by ?? ''),
  };
}

interface ListBatchesResp { data?: { batches?: RawBatch[]; count?: number; error?: string } }
interface ListReqsResp { data?: { requests?: RawSeedlingRequest[]; count?: number; error?: string } }
interface SubmitResp { data?: { status?: string; name?: string; message?: string; error?: string } }

export const propagationApi = {
  async listBatches(stage?: string): Promise<PropagationBatch[]> {
    const body = await api<ListBatchesResp>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListPropagationBatches',
      data: stage ? { stage, limit: 200 } : { limit: 200 },
    });
    return (body.data?.batches ?? []).map(toBatch);
  },

  async recordLog(payload: PropagationLogPayload): Promise<{ name: string; message: string }> {
    const body = await api<SubmitResp>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionRecordPropagationLog',
      data: payload,
    });
    return { name: body.data?.name ?? '', message: body.data?.message ?? '' };
  },

  async listSeedlingRequests(status?: string): Promise<SeedlingRequest[]> {
    const body = await api<ListReqsResp>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListSeedlingRequests',
      data: status ? { status, limit: 200 } : { limit: 200 },
    });
    return (body.data?.requests ?? []).map(toRequest);
  },

  async createSeedlingRequest(
    payload: SeedlingRequestPayload,
  ): Promise<{ name: string; message: string }> {
    const body = await api<SubmitResp>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionCreateSeedlingRequest',
      data: payload,
    });
    return { name: body.data?.name ?? '', message: body.data?.message ?? '' };
  },
};
