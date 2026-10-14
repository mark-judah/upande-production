import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import {
  greenhouseSpecApi,
  type GreenhouseListItem,
  type GreenhouseSpec,
  type GrowerCandidate,
} from '@/src/services/greenhouse-specs';

type Outcome = { ok: true; message: string } | { ok: false; error: string };

interface GreenhouseSpecsState {
  greenhouses: GreenhouseListItem[];
  loading: boolean;
  error: string | null;
  farmFilter: string;

  /** Greenhouses picked on the list screen (multi-select). */
  selected: string[];

  /** One spec per selected greenhouse, loaded on the detail screen. */
  specs: GreenhouseSpec[];
  specLoading: boolean;
  specError: string | null;

  candidates: GrowerCandidate[];
  candidatesLoading: boolean;
  acting: boolean;

  load: () => Promise<void>;
  setFarmFilter: (farm: string) => void;
  toggleSelected: (greenhouse: string) => void;
  setSelected: (greenhouses: string[]) => void;
  clearSelected: () => void;
  loadSpec: (greenhouses: string[]) => Promise<void>;
  loadCandidates: (search?: string) => Promise<void>;
  addGrower: (employee: string, greenhouse: string) => Promise<Outcome>;
  removeGrower: (employee: string, greenhouse: string) => Promise<Outcome>;
}

export const useGreenhouseSpecsStore = create<GreenhouseSpecsState>((set, get) => ({
  greenhouses: [],
  loading: false,
  error: null,
  farmFilter: '',

  selected: [],

  specs: [],
  specLoading: false,
  specError: null,

  candidates: [],
  candidatesLoading: false,
  acting: false,

  load: async () => {
    set({ loading: true, error: null });
    try {
      // Always fetch the full, unfiltered list. The farm filter is applied
      // client-side (see greenhouse-specs.tsx) so the "Farm" dropdown's own
      // options — derived from this same list — never shrink to just the
      // currently-selected farm.
      const greenhouses = await greenhouseSpecApi.list({});
      set({ greenhouses, loading: false });
    } catch (err) {
      set({ error: mapAxiosError(err).message, loading: false });
    }
  },

  setFarmFilter: (farm) => set({ farmFilter: farm }),

  toggleSelected: (greenhouse) => {
    const current = get().selected;
    set({
      selected: current.includes(greenhouse)
        ? current.filter((g) => g !== greenhouse)
        : [...current, greenhouse],
    });
  },

  setSelected: (greenhouses) => set({ selected: greenhouses }),

  clearSelected: () => set({ selected: [] }),

  loadSpec: async (greenhouses) => {
    if (greenhouses.length === 0) {
      set({ specs: [], specLoading: false, specError: null });
      return;
    }
    set({ specLoading: true, specError: null });
    try {
      const specs = await greenhouseSpecApi.getMany(greenhouses);
      set({ specs, specLoading: false });
    } catch (err) {
      set({ specError: mapAxiosError(err).message, specLoading: false });
    }
  },

  loadCandidates: async (search) => {
    set({ candidatesLoading: true });
    try {
      const candidates = await greenhouseSpecApi.listGrowerCandidates(search);
      set({ candidates, candidatesLoading: false });
    } catch {
      set({ candidatesLoading: false });
    }
  },

  addGrower: async (employee, greenhouse) => {
    if (!greenhouse) return { ok: false, error: 'No greenhouse selected.' };
    set({ acting: true });
    try {
      const r = await greenhouseSpecApi.setGrower(employee, greenhouse, 'add');
      await get().loadSpec(get().specs.map((s) => s.name));
      set({ acting: false });
      return { ok: true, message: r.status === 'exists' ? 'Already a grower here.' : 'Grower added.' };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  removeGrower: async (employee, greenhouse) => {
    if (!greenhouse) return { ok: false, error: 'No greenhouse selected.' };
    set({ acting: true });
    try {
      await greenhouseSpecApi.setGrower(employee, greenhouse, 'remove');
      await get().loadSpec(get().specs.map((s) => s.name));
      set({ acting: false });
      return { ok: true, message: 'Grower removed.' };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },
}));
