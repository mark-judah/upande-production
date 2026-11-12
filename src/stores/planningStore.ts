import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import {
  planningApi,
  type PlanAction,
  type PlanDetail,
  type PlanSummary,
  type SavePlanPayload,
  type UpdateTaskPayload,
  PENDING_STATES,
} from '@/src/services/planning';

type Outcome = { ok: true; name: string; message: string } | { ok: false; error: string };

interface PlanFilters {
  farm?: string;
  greenhouses?: string[];
  plan_year?: number;
  plan_week?: number;
  scope?: 'mine' | 'all';
}

interface PlanningState {
  plans: PlanSummary[];
  loading: boolean;
  error: string | null;
  acting: boolean;
  filters: PlanFilters;

  detail: PlanDetail | null;
  detailLoading: boolean;
  /** Header of the last plan created, reused by the next new plan. */
  lastPlan: { company: string; farm: string; greenhouse: string };

  load: (filters?: PlanFilters) => Promise<void>;
  setFilters: (next: PlanFilters) => void;
  clearFilters: () => Promise<void>;
  open: (name: string) => Promise<void>;
  closeDetail: () => void;
  setLastPlan: (header: { company: string; farm: string; greenhouse: string }) => void;
  save: (p: SavePlanPayload) => Promise<Outcome>;
  updateTask: (p: UpdateTaskPayload) => Promise<Outcome>;

  /** Plans waiting on a manager (Approvals screen). */
  approvals: PlanSummary[];
  approvalsLoading: boolean;
  loadApprovals: () => Promise<void>;
  runAction: (p: { name: string; action: PlanAction; comment?: string; rating?: number }) => Promise<Outcome>;
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  plans: [],
  loading: false,
  error: null,
  acting: false,
  filters: { scope: 'mine' },

  detail: null,
  detailLoading: false,
  approvals: [],
  approvalsLoading: false,
  lastPlan: { company: '', farm: '', greenhouse: '' },

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
    const next = { scope: get().filters.scope };
    set({ filters: next });
    await get().load(next);
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

  setLastPlan: (lastPlan) => set({ lastPlan }),

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

  loadApprovals: async () => {
    set({ approvalsLoading: true });
    try {
      const approvals = await planningApi.list({ limit: 200, scope: 'all', workflow_states: PENDING_STATES });
      set({ approvals, approvalsLoading: false });
    } catch (err) {
      set({ approvalsLoading: false, error: mapAxiosError(err).message });
    }
  },

  runAction: async (payload) => {
    set({ acting: true });
    try {
      const r = await planningApi.action(payload);
      set({ acting: false });
      if (get().detail?.name === payload.name) await get().open(payload.name);
      get().load();
      get().loadApprovals();
      return { ok: true, name: payload.name, message: r.message };
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
