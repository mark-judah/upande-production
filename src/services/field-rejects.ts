import { api, apiClient, HttpError, mapAxiosError } from './api';

export interface FieldRejectPayload {
  variety: string;
  no_of_stems: number;
  rejection_reason: string;
  farm: string;
  greenhouse: string;
}

export interface FieldRejectOutcome {
  name: string;
  message: string;
}

/**
 * Calls the legacy `submitFieldRejects` endpoint (module: Upande Kaitet).
 * That script returns its payload under `frappe.response["message"]` and
 * raises `frappe.throw` on validation errors instead of soft errors, so
 * the wrapper handles both response shapes.
 */
export async function submitFieldReject(payload: FieldRejectPayload): Promise<FieldRejectOutcome> {
  try {
    const res = await apiClient().request<{ message?: { status?: string; name?: string; message?: string } }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.submitFieldRejects',
      data: payload,
    });
    const inner = res.data?.message;
    if (!inner || inner.status !== 'success') {
      throw new HttpError(res.status || 200, 'Unexpected response from server.', res.data);
    }
    return {
      name: inner.name ?? '',
      message: inner.message ?? 'Field rejection recorded.',
    };
  } catch (err) {
    throw mapAxiosError(err);
  }
}

export interface FieldRejectEntry {
  name: string;
  date: string;
  time: string;
  farm: string;
  greenhouse: string;
  variety: string;
  stems: number;
  reason: string;
  recordedBy: string;
}

export interface FieldRejectList {
  total: number;
  totalStems: number;
  entries: FieldRejectEntry[];
}

interface RawFieldRejectList {
  data?: {
    error?: string;
    total?: number;
    total_stems?: number;
    entries?: {
      name?: string;
      date?: string;
      time?: string;
      farm?: string;
      greenhouse?: string;
      variety?: string;
      stems?: number;
      reason?: string;
      recorded_by?: string;
    }[];
  };
}

/** Submitted Field Rejects entries, newest first. */
export async function listFieldRejects(params: {
  farm: string;
  greenhouse: string;
  start: number;
  pageLength: number;
}): Promise<FieldRejectList> {
  const body = await api<RawFieldRejectList>({
    method: 'POST',
    url: '/api/method/upande_agriculture.mobile.api.productionListFieldRejects',
    data: { farm: params.farm, greenhouse: params.greenhouse, start: params.start, page_length: params.pageLength },
  });
  const d = body.data ?? {};
  return {
    total: Number(d.total ?? 0),
    totalStems: Number(d.total_stems ?? 0),
    entries: (d.entries ?? []).map((e) => ({
      name: String(e.name ?? ''),
      date: String(e.date ?? ''),
      time: String(e.time ?? ''),
      farm: String(e.farm ?? ''),
      greenhouse: String(e.greenhouse ?? ''),
      variety: String(e.variety ?? ''),
      stems: Number(e.stems ?? 0),
      reason: String(e.reason ?? ''),
      recordedBy: String(e.recorded_by ?? ''),
    })),
  };
}
