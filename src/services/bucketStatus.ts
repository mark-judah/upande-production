import { api, HttpError, mapAxiosError } from '@/src/services/api';

export interface BucketEntry {
  /** The Harvesting Stock Entry backing this row — pass to editEntry() to
   *  correct it. Undefined only if the backend response is stale (predates
   *  this field) — the Edit button guards against that case. */
  name?: string;
  variety: string;
  stemLength: string;
  greenhouse: string;
  cutStage: string;
  /** Display name (falls back to the Employee id if the name can't be resolved). */
  harvester: string;
  qty: number;
  /** Raw "YYYY-MM-DD HH:mm:ss" — format with formatExactTime() for display. */
  time: string;
}

export interface BucketStatus {
  bucketId: string;
  /** null when the bucket has never been harvested into at all. */
  received: boolean | null;
  /** Raw "YYYY-MM-DD HH:mm:ss" of the receive, if received. */
  receivedAt: string | null;
  /** The latest harvest journey's entries — shown whether or not it's been
   *  received yet. Several rows for Spray Roses (one per grading scan,
   *  possibly mixed varieties/lengths); a single row for Standard Roses. */
  entries: BucketEntry[];
  totalStems: number;
}

interface RawEntry {
  name?: string;
  variety?: string;
  stem_length?: string;
  greenhouse?: string;
  cut_stage?: string;
  harvester?: string;
  qty?: number;
  time?: string;
}

interface RawStatus {
  data?: {
    bucket_id?: string;
    received?: boolean | null;
    received_at?: string | null;
    entries?: RawEntry[];
    total_stems?: number;
    error?: string;
  };
}

export const bucketStatusApi = {
  async getStatus(bucketId: string): Promise<BucketStatus> {
    let body: RawStatus;
    try {
      body = await api<RawStatus>({
        method: 'POST',
        url: '/api/method/upande_agriculture.mobile.api.getBucketStatus',
        data: { bucket_id: bucketId },
      });
    } catch (err) {
      throw mapAxiosError(err);
    }
    if (body.data?.error) throw new HttpError(200, body.data.error, body);
    return {
      bucketId: String(body.data?.bucket_id ?? bucketId),
      received: body.data?.received ?? null,
      receivedAt: body.data?.received_at ?? null,
      entries: (body.data?.entries ?? []).map((e) => ({
        name: e.name ? String(e.name) : undefined,
        variety: String(e.variety ?? 'Unspecified'),
        stemLength: String(e.stem_length ?? 'Unspecified'),
        greenhouse: String(e.greenhouse ?? 'Unspecified'),
        cutStage: String(e.cut_stage ?? 'Unspecified'),
        harvester: String(e.harvester ?? 'Unspecified'),
        qty: Number(e.qty ?? 0),
        time: String(e.time ?? ''),
      })),
      totalStems: Number(body.data?.total_stems ?? 0),
    };
  },

  /** Corrects a still-pending entry's variety, stem length, cut stage and/or
   *  quantity via the backend's cancel+amend flow. Only valid while the
   *  bucket's latest journey is unreceived (received === false) -- the
   *  backend re-checks this itself regardless of what the UI shows. */
  async editEntry(params: {
    stockEntryName: string;
    variety: string;
    stemLength: string;
    cutStage: string;
    qty: number;
  }): Promise<{
    stockEntry: string;
    variety: string;
    stemLength: string;
    cutStage: string;
    qty: number;
    amended: boolean;
  }> {
    let body: {
      data?: {
        stock_entry?: string;
        variety?: string;
        stem_length?: string;
        cut_stage?: string;
        qty?: number;
        amended?: boolean;
        error?: string;
      };
    };
    try {
      body = await api({
        method: 'POST',
        url: '/api/method/upande_agriculture.mobile.api.amendHarvestEntry',
        data: {
          stock_entry_name: params.stockEntryName,
          variety: params.variety,
          stem_length: params.stemLength,
          cut_stage: params.cutStage,
          qty: params.qty,
        },
      });
    } catch (err) {
      throw mapAxiosError(err);
    }
    if (body.data?.error) throw new HttpError(200, body.data.error, body);
    return {
      stockEntry: String(body.data?.stock_entry ?? params.stockEntryName),
      variety: String(body.data?.variety ?? params.variety),
      stemLength: String(body.data?.stem_length ?? params.stemLength),
      cutStage: String(body.data?.cut_stage ?? params.cutStage),
      qty: Number(body.data?.qty ?? params.qty),
      amended: !!body.data?.amended,
    };
  },
};
