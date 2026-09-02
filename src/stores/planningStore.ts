import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import {
  planningApi,
  type PlanDetail,
  type PlanSummary,
  type SavePlanPayload,
  type UpdateTaskPayload,
} from '@/src/services/planning';

type Outcome = { ok: true; name: string; message: string } | { ok: false; error: string };

interface PlanFilters {
  greenhouse?: string;
  plan_year?: number;
  plan_week?: number;
}

interface PlanningState {
  plans: PlanSummary[];
  loading: boolean;
  error: string | null;
  acting: boolean;
  filters: PlanFilters;

  detail: PlanDetail | null;
  detailLoading: boolean;

  load: (filters?: PlanFilters) => Promise<void>;
  setFilters: (next: PlanFilters) => void;
  clearFilters: () => Promise<void>;
  open: (name: string) => Promise<void>;
  closeDetail: () => void;
  save: (p: SavePlanPayload) => Promise<Outcome>;
  updateTask: (p: UpdateTaskPayload) => Promise<Outcome>;
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  plans: [],
  loading: false,
  error: null,
  acting: false,
  filters: {},

  detail: null,
  detailLoading: false,

  load: async (filters) => {
    const active = filters ?? get().filters;
    set({ loading: true, error: null });
    try {
      const plans = await planningApi.list({ limit: 200, ...active });
      set({ plans, loading: false });
    } catch (err) {
      set({ error: mapAxiosError(err).message, loading: false });
    }
  },

  setFilters: (next) => {
    set({ filters: next });
    get().load(next);
  },

  clearFilters: async () => {
    set({ filters: {} });
    await get().load({});
  },

  open: async (name) => {
    set({ detailLoading: true });
    try {
      const detail = await planningApi.get(name);
      set({ detail, detailLoading: false });
    } catch (err) {
      set({ detailLoading: false, error: mapAxiosError(err).message });
    }
  },

  closeDetail: () => set({ detail: null }),

  save: async (payload) => {
    set({ acting: true });
    try {
      const r = await planningApi.save(payload);
      set({ acting: false });
      get().load();
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  updateTask: async (payload) => {
    set({ acting: true });
    try {
      const r = await planningApi.updateTask(payload);
      set({ acting: false });
      // Refresh the open detail so the status chip moves immediately.
      if (get().detail?.name === payload.plan) await get().open(payload.plan);
      get().load();
      return { ok: true, name: payload.task, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },
}));
