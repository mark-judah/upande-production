import { api, apiClient, HttpError, mapAxiosError } from './api';
import type { PickerOption } from './crop-cycle';

export interface VarietyOption extends PickerOption {
  area?: number;
  /** Item group of the variety's Item -- always a LEAF group (e.g. "Spray
   *  Roses - Bombastics"), never the bare "Spray Roses"/"Standard Roses"
   *  parent, since real items are never assigned directly to a parent
   *  group. Don't filter on this directly -- use isSprayRose. */
  itemGroup?: string;
  /** True if this variety is anywhere under the Spray Roses item group tree
   *  (computed server-side via the real ancestor chain, not a string
   *  match against itemGroup). */
  isSprayRose?: boolean;
}

export interface EmployeeOption extends PickerOption {}

export interface GreenhouseData {
  varieties: VarietyOption[];
  employees: EmployeeOption[];
  /** Cut stages from the Cut Stage master (fetched with greenhouse data). */
  cutStages: string[];
  /** Guidance shown when the greenhouse has no crop cycle yet (empty varieties). */
  notice: string | null;
}

export interface HarvestPayload {
  farm: string;
  greenhouse: string;
  harvester: string;
  bucket_id: string;
  stem_length: string;
  item_code: string;
  quantity: number;
  cut_stage: string;
}

export interface HarvestOutcome {
  name: string;
  message: string;
}

interface RawGreenhouseData {
  data?: {
    varieties?: Array<{ variety?: string; area?: number; item_group?: string; is_spray_rose?: boolean }>;
    employees?: Array<{ name?: string; employee_name?: string }>;
    cut_stages?: string[];
    notice?: string | null;
    error?: string;
  };
}

interface StemLengthResp {
  data?: Array<{ length?: string }>;
}

export const harvestingApi = {
  /** Fetches varieties grown + employees assigned to a given greenhouse. */
  async getGreenhouseData(greenhouseName: string): Promise<GreenhouseData> {
    const body = await api<RawGreenhouseData>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.getGreenhouseData',
      data: { greenhouse_name: greenhouseName },
    });
    const varieties = (body.data?.varieties ?? []).map<VarietyOption>((v) => ({
      name: String(v.variety ?? ''),
      label: String(v.variety ?? ''),
      area: typeof v.area === 'number' ? v.area : undefined,
      itemGroup: v.item_group ? String(v.item_group) : undefined,
      isSprayRose: !!v.is_spray_rose,
    }));
    // name must be the actual Employee id (custom_harvester/graded_by are
    // Link(Employee) fields elsewhere) -- it was employee_name here, which
    // made every harvest/grading submission fail Link validation server-side
    // unless an employee's full name happened to collide with someone's id.
    const employees = (body.data?.employees ?? []).map<EmployeeOption>((e) => ({
      name: String(e.name ?? ''),
      label: String(e.employee_name ?? e.name ?? ''),
    }));
    const cutStages = (body.data?.cut_stages ?? []).map((c) => String(c)).filter(Boolean);
    return { varieties, employees, cutStages, notice: body.data?.notice ?? null };
  },

  /** All Stem Length options (read directly from Frappe REST — no script). */
  async listStemLengths(): Promise<PickerOption[]> {
    const body = await api<StemLengthResp>({
      method: 'GET',
      url: '/api/resource/Stem Length',
      params: { fields: JSON.stringify(['length']), limit_page_length: 200 },
    });
    return (body.data ?? [])
      .map<PickerOption>((r) => ({ name: String(r.length ?? ''), label: String(r.length ?? '') }))
      .filter((o) => !!o.name);
  },

  /**
   * Submits a harvest stock entry. The legacy endpoint returns its result
   * under `frappe.response["message"]` and raises `frappe.throw` for
   * validation, so we handle both shapes.
   */
  async createHarvest(payload: HarvestPayload): Promise<HarvestOutcome> {
    try {
      const res = await apiClient().request<{ message?: any; data?: any; error?: string }>({
        method: 'POST',
        url: '/api/method/upande_agriculture.mobile.api.createHarvestStockEntry',
        data: payload,
      });
      const body: any = res.data;
      // Some legacy scripts surface domain errors at the top level under `error`
      // even when HTTP is 200 — surface that here.
      if (body?.error) {
        throw new HttpError(res.status || 200, body.error, body);
      }
      const inner = body?.message ?? body?.data ?? {};
      return {
        name: String(inner.name ?? ''),
        message: String(inner.message ?? 'Harvest recorded.'),
      };
    } catch (err) {
      throw mapAxiosError(err);
    }
  },
};
