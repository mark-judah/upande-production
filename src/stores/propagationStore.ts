import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import {
  propagationApi,
  type PropagationBatch,
  type PropagationLogPayload,
  type SeedlingRequest,
  type SeedlingRequestPayload,
} from '@/src/services/propagation';

type Outcome = { ok: true; name: string; message: string } | { ok: false; error: string };

interface PropagationState {
  batches: PropagationBatch[];
  batchesLoading: boolean;
  batchesError: string | null;

  requests: SeedlingRequest[];
  requestsLoading: boolean;
  requestsError: string | null;

  acting: boolean;

  loadBatches: () => Promise<void>;
  loadRequests: () => Promise<void>;
  recordLog: (p: PropagationLogPayload) => Promise<Outcome>;
  createRequest: (p: SeedlingRequestPayload) => Promise<Outcome>;
}

export const usePropagationStore = create<PropagationState>((set, get) => ({
  batches: [],
  batchesLoading: false,
  batchesError: null,

  requests: [],
  requestsLoading: false,
  requestsError: null,

  acting: false,

  loadBatches: async () => {
    set({ batchesLoading: true, batchesError: null });
    try {
      const batches = await propagationApi.listBatches();
      set({ batches, batchesLoading: false });
    } catch (err) {
      set({ batchesError: mapAxiosError(err).message, batchesLoading: false });
    }
  },

  loadRequests: async () => {
    set({ requestsLoading: true, requestsError: null });
    try {
      const requests = await propagationApi.listSeedlingRequests();
      set({ requests, requestsLoading: false });
    } catch (err) {
      set({ requestsError: mapAxiosError(err).message, requestsLoading: false });
    }
  },

  recordLog: async (payload) => {
    set({ acting: true });
    try {
      const r = await propagationApi.recordLog(payload);
      set({ acting: false });
      get().loadBatches();
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  createRequest: async (payload) => {
    set({ acting: true });
    try {
      const r = await propagationApi.createSeedlingRequest(payload);
      set({ acting: false });
      get().loadRequests();
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },
}));
