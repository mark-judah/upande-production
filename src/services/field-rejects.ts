import { apiClient, HttpError, mapAxiosError } from './api';

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
