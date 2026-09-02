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

  spec: GreenhouseSpec | null;
  specLoading: boolean;
  specError: string | null;

  candidates: GrowerCandidate[];
  candidatesLoading: boolean;
  acting: boolean;

  load: () => Promise<void>;
  setFarmFilter: (farm: string) => void;
  loadSpec: (greenhouse: string) => Promise<void>;
  loadCandidates: (search?: string) => Promise<void>;
  addGrower: (employee: string) => Promise<Outcome>;
  removeGrower: (employee: string) => Promise<Outcome>;
}

export const useGreenhouseSpecsStore = create<GreenhouseSpecsState>((set, get) => ({
  greenhouses: [],
  loading: false,
  error: null,
  farmFilter: '',

  spec: null,
  specLoading: false,
  specError: null,

  candidates: [],
  candidatesLoading: false,
  acting: false,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const greenhouses = await greenhouseSpecApi.list({ farm: get().farmFilter });
      set({ greenhouses, loading: false });
    } catch (err) {
      set({ error: mapAxiosError(err).message, loading: false });
    }
  },

  setFarmFilter: (farm) => {
    set({ farmFilter: farm });
    get().load();
  },

  loadSpec: async (greenhouse) => {
    set({ specLoading: true, specError: null });
    try {
      const spec = await greenhouseSpecApi.get(greenhouse);
      set({ spec, specLoading: false });
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

  addGrower: async (employee) => {
    const gh = get().spec?.name;
    if (!gh) return { ok: false, error: 'No greenhouse selected.' };
    set({ acting: true });
    try {
      const r = await greenhouseSpecApi.setGrower(employee, gh, 'add');
      await get().loadSpec(gh);
      set({ acting: false });
      return { ok: true, message: r.status === 'exists' ? 'Already a grower here.' : 'Grower added.' };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  removeGrower: async (employee) => {
    const gh = get().spec?.name;
    if (!gh) return { ok: false, error: 'No greenhouse selected.' };
    set({ acting: true });
    try {
      await greenhouseSpecApi.setGrower(employee, gh, 'remove');
      await get().loadSpec(gh);
      set({ acting: false });
      return { ok: true, message: 'Grower removed.' };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },
}));
