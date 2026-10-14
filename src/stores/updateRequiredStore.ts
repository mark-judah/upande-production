import { create } from 'zustand';

export type GateInfo = { minVersion: string | null; latestVersion: string | null };

/** The gate response body is read leniently: Frappe may nest custom keys. */
export function parseGateBody(body: unknown): GateInfo {
  const empty: GateInfo = { minVersion: null, latestVersion: null };
  if (!body || typeof body !== 'object') return empty;
  const b = body as Record<string, any>;
  const src = typeof b.min_version === 'string' || typeof b.latest_version === 'string' ? b : b.message ?? b.data ?? {};
  return {
    minVersion: typeof src.min_version === 'string' ? src.min_version : null,
    latestVersion: typeof src.latest_version === 'string' ? src.latest_version : null,
  };
}

interface UpdateRequiredState extends GateInfo {
  required: boolean;
  trigger: (body?: unknown) => void;
  clear: () => void;
}

export const useUpdateRequiredStore = create<UpdateRequiredState>((set) => ({
  required: false,
  minVersion: null,
  latestVersion: null,
  trigger: (body) => set({ required: true, ...parseGateBody(body) }),
  clear: () => set({ required: false, minVersion: null, latestVersion: null }),
}));
