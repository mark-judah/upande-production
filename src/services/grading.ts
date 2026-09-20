import { apiClient, HttpError, mapAxiosError } from './api';

export type RoseType = 'Standard Roses' | 'Spray Roses';

export interface BunchEntry {
  name: string;
  scannedGrading: number;
  scannedPacking: number;
  greenhouse: string;
  stockEntryType: string;
  gradedBy: string;
  bunchId: string;
  stemLength: string;
  bunchSize: string;
  variety: string;
  uom: string;
}

export interface BucketContentRow {
  variety: string;
  stems: number;
}
export interface BucketContents {
  contents: BucketContentRow[];
  totalStems: number;
}

export interface GradingPayload {
  farm: string;
  stock_entry_type: 'Grading';
  graded_by: string;
  bunch_id: string;
  qty: number;
  rose_type: RoseType;
  source_warehouse: string;
  bucket_id: string;
}

interface RawBunchResp {
  message?: {
    name?: string;
    scanned_grading?: number;
    scanned_packing?: number;
    greenhouse?: string;
    stock_entry_type?: string;
    graded_by?: string;
    bunch_id?: string;
    stem_length?: string;
    bunch_size?: string;
    items?: Array<{ item_code?: string; uom?: string }>;
    error?: string;
    message?: string;
  };
}

function toBunchEntry(raw: RawBunchResp): BunchEntry {
  const m = raw.message ?? {};
  const item = (m.items && m.items[0]) || {};
  return {
    name: String(m.name ?? ''),
    scannedGrading: Number(m.scanned_grading ?? 0),
    scannedPacking: Number(m.scanned_packing ?? 0),
    greenhouse: String(m.greenhouse ?? ''),
    stockEntryType: String(m.stock_entry_type ?? ''),
    gradedBy: String(m.graded_by ?? ''),
    bunchId: String(m.bunch_id ?? ''),
    stemLength: String(m.stem_length ?? ''),
    bunchSize: String(m.bunch_size ?? ''),
    variety: String(item.item_code ?? ''),
    uom: String(item.uom ?? ''),
  };
}

/** Parses scanned QR text — accepts plain strings or JSON payloads. */
export function parseScanned(raw: string, kind: 'bucket' | 'grader' | 'bunch'): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      if (kind === 'bucket') {
        // QR format: { "<bucket_id>": "bucket" } — find the key whose value is "bucket".
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (v === 'bucket' && k) return k;
        }
        // Fallback: { "bucket_id": "..." }
        const direct = (parsed as Record<string, unknown>).bucket_id;
        if (typeof direct === 'string') return direct;
      }
      if (kind === 'grader') {
        const v = (parsed as Record<string, unknown>).grader;
        if (typeof v === 'string') return v;
      }
      if (kind === 'bunch') {
        const v = (parsed as Record<string, unknown>).bunch_id;
        if (typeof v === 'string') return v;
      }
    }
  } catch {
    // Not JSON — fall through and return raw.
  }
  return trimmed;
}

/**
 * True when raw scanned text is a genuine bucket/grader/bunch QR — i.e. it
 * matches the JSON shape printed on that label type (see
 * upande_packhouse/server_scripts/gen_label_id.py):
 *   bucket: {"BUCKET-<n>": "bucket"}   grader: {"grader": "<name>"}
 *   bunch:  {"bunch_id": "BUNCH-<n>"}
 * Free-typed IDs (not JSON) are a separate, trusted input path and are not
 * checked here — this only guards the camera scan result.
 */
export function isValidScan(raw: string, kind: 'bucket' | 'grader' | 'bunch'): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return false;
    const obj = parsed as Record<string, unknown>;
    if (kind === 'bucket') return Object.values(obj).some((v) => v === 'bucket');
    if (kind === 'grader') return typeof obj.grader === 'string' && obj.grader.length > 0;
    if (kind === 'bunch') return typeof obj.bunch_id === 'string' && obj.bunch_id.length > 0;
    return false;
  } catch {
    return false;
  }
}

export const gradingApi = {
  /**
   * Validates a bunch QR before grading it: returns the bunch's current
   * status (incl. whether it's already been graded — `scannedGrading == 1`).
   */
  async fetchBunch(bunchId: string): Promise<BunchEntry> {
    try {
      const res = await apiClient().request<RawBunchResp>({
        method: 'POST',
        url: '/api/method/upande_packhouse.mobile.api.fetchStockEntryByBunch',
        data: { custom_bunch_id: bunchId, action: 'grading' },
      });
      const m = res.data?.message ?? {};
      if (m.error) throw new HttpError(res.status || 200, m.error, res.data);
      if (m.message && !m.name) throw new HttpError(res.status || 200, m.message, res.data);
      return toBunchEntry(res.data ?? {});
    } catch (err) {
      throw mapAxiosError(err);
    }
  },

  /** Submits a grading stock entry. Auto-runs after a successful fetchBunch. */
  async createGrading(payload: GradingPayload): Promise<{ message: string }> {
    try {
      const res = await apiClient().request<{ message?: any; data?: any; error?: string }>({
        method: 'POST',
        url: '/api/method/upande_agriculture.mobile.api.createGradingStockEntry',
        data: payload,
      });
      const body: any = res.data;
      if (body?.error) throw new HttpError(res.status || 200, body.error, body);
      const inner = body?.message ?? body?.data ?? {};
      return { message: String(inner.message ?? 'Bunch graded.') };
    } catch (err) {
      throw mapAxiosError(err);
    }
  },

  /** Varieties + stems scanned into a bucket today (spray grading tally). */
  async bucketContents(bucketId: string): Promise<BucketContents> {
    const res = await apiClient().request<{
      message?: { contents?: Array<{ variety?: string; stems?: number }>; total_stems?: number };
    }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.fetchBucketContents',
      data: { bucket_id: bucketId },
    });
    const m = res.data?.message ?? {};
    return {
      contents: (m.contents ?? []).map((c) => ({
        variety: String(c.variety ?? ''),
        stems: Number(c.stems ?? 0),
      })),
      totalStems: Number(m.total_stems ?? 0),
    };
  },
};
