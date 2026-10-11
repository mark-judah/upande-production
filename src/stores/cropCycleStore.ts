import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import {
  cropCycleApi,
  type CropCycle,
  type NewCropCyclePayload,
  type NewPlantingPayload,
  type PickerOption,
  type ReplantPayload,
  type UprootPayload,
} from '@/src/services/crop-cycle';

type Outcome = { ok: true; name: string; message: string } | { ok: false; error: string };

interface CycleFilters {
  farm?: string;
  greenhouse?: string;
  variety?: string;
}

interface CropCycleState {
  cycles: CropCycle[];
  loading: boolean;
  error: string | null;
  acting: boolean;
  filters: CycleFilters;

  greenhouses: PickerOption[];
  varieties: PickerOption[];
  farms: PickerOption[];
  companies: PickerOption[];
  rejectionReasons: PickerOption[];
  pickersLoading: boolean;
  rejectionReasonsLoading: boolean;

  load: (filters?: CycleFilters) => Promise<void>;
  setFilters: (next: CycleFilters) => void;
  clearFilters: () => Promise<void>;
  loadPickers: () => Promise<void>;
  loadRejectionReasons: () => Promise<void>;
  createPlanting: (p: NewPlantingPayload) => Promise<Outcome>;
  createCycle: (p: NewCropCyclePayload) => Promise<Outcome>;
  recordUproot: (p: UprootPayload) => Promise<Outcome>;
  recordReplant: (p: ReplantPayload) => Promise<Outcome>;
}

export const useCropCycleStore = create<CropCycleState>((set, get) => ({
  cycles: [],
  loading: false,
  error: null,
  acting: false,
  filters: {},

  greenhouses: [],
  varieties: [],
  farms: [],
  companies: [],
  rejectionReasons: [],
  pickersLoading: false,
  rejectionReasonsLoading: false,

  load: async (filters) => {
    const active = filters ?? get().filters;
    set({ loading: true, error: null });
    try {
      const cycles = await cropCycleApi.list({ limit: 200, ...active });
      set({ cycles, loading: false });
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

  loadPickers: async () => {
    if (get().pickersLoading) return;
    set({ pickersLoading: true });
    try {
      const [greenhouses, varieties, farms, companies] = await Promise.all([
        cropCycleApi.listGreenhouses(),
        cropCycleApi.listVarieties(),
        cropCycleApi.listFarms(),
        cropCycleApi.listCompanies(),
      ]);
      set({ greenhouses, varieties, farms, companies, pickersLoading: false });
    } catch {
      set({ pickersLoading: false });
    }
  },

  // Only the Field Rejects screen consumes rejection reasons, so it is loaded
  // on demand rather than bundled into loadPickers (which runs on many pages).
  loadRejectionReasons: async () => {
    if (get().rejectionReasonsLoading) return;
    set({ rejectionReasonsLoading: true });
    try {
      const rejectionReasons = await cropCycleApi.listRejectionReasons();
      set({ rejectionReasons, rejectionReasonsLoading: false });
    } catch {
      set({ rejectionReasonsLoading: false });
    }
  },

  createPlanting: async (payload) => {
    set({ acting: true });
    try {
      const r = await cropCycleApi.createPlanting(payload);
      set({ acting: false });
      // Refresh the list so the new cycle appears
      get().load();
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  createCycle: async (payload) => {
    set({ acting: true });
    try {
      const r = await cropCycleApi.createCycle(payload);
      set({ acting: false });
      get().load();
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  recordUproot: async (payload) => {
    set({ acting: true });
    try {
      const r = await cropCycleApi.recordUproot(payload);
      set({ acting: false });
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  recordReplant: async (payload) => {
    set({ acting: true });
    try {
      const r = await cropCycleApi.recordReplant(payload);
      set({ acting: false });
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },
}));
