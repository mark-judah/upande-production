import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import {
  harvestingApi,
  type EmployeeOption,
  type HarvestPayload,
  type VarietyOption,
} from '@/src/services/harvesting';
import { cropCycleApi, type PickerOption } from '@/src/services/crop-cycle';

type Outcome = { ok: true; name: string; message: string } | { ok: false; error: string };

interface HarvestingState {
  /** Stem-length list — global, loaded once. */
  stemLengths: PickerOption[];
  stemLengthsLoading: boolean;

  /** Greenhouses scoped to the currently-selected farm. Empty until the user
   *  picks a farm. Separate from cropCycleStore.greenhouses (which holds the
   *  full unscoped list). */
  farmGreenhouses: PickerOption[];
  farmGreenhousesLoading: boolean;
  cachedFarm: string | null;

  /** Greenhouse-scoped data, refreshed when the user picks a different GH. */
  varieties: VarietyOption[];
  employees: EmployeeOption[];
  ghDataLoading: boolean;
  ghDataError: string | null;
  /** Cut stages fetched with greenhouse data (from the Cut Stage master). */
  cutStages: string[];
  /** Guidance from the backend when the greenhouse has no crop cycle yet. */
  ghDataNotice: string | null;
  /** Greenhouse currently cached in `varieties` + `employees`. */
  cachedGreenhouse: string | null;

  acting: boolean;

  loadStemLengths: () => Promise<void>;
  loadGreenhousesForFarm: (farm: string) => Promise<void>;
  loadGreenhouseData: (greenhouse: string) => Promise<void>;
  createHarvest: (payload: HarvestPayload) => Promise<Outcome>;
  resetGreenhouseData: () => void;
}

export const useHarvestingStore = create<HarvestingState>((set, get) => ({
  stemLengths: [],
  stemLengthsLoading: false,

  farmGreenhouses: [],
  farmGreenhousesLoading: false,
  cachedFarm: null,

  varieties: [],
  employees: [],
  ghDataLoading: false,
  ghDataError: null,
  cutStages: [],
  ghDataNotice: null,
  cachedGreenhouse: null,

  acting: false,

  loadStemLengths: async () => {
    if (get().stemLengthsLoading) return;
    set({ stemLengthsLoading: true });
    try {
      const stemLengths = await harvestingApi.listStemLengths();
      set({ stemLengths, stemLengthsLoading: false });
    } catch {
      set({ stemLengthsLoading: false });
    }
  },

  loadGreenhousesForFarm: async (farm) => {
    if (!farm) {
      set({ farmGreenhouses: [], cachedFarm: null });
      return;
    }
    if (get().cachedFarm === farm) return;
    set({ farmGreenhousesLoading: true });
    try {
      const list = await cropCycleApi.listGreenhouses({ farm });
      set({ farmGreenhouses: list, cachedFarm: farm, farmGreenhousesLoading: false });
    } catch {
      set({ farmGreenhouses: [], farmGreenhousesLoading: false });
    }
  },

  loadGreenhouseData: async (greenhouse) => {
    if (!greenhouse) return;
    if (get().cachedGreenhouse === greenhouse) return;
    set({ ghDataLoading: true, ghDataError: null, ghDataNotice: null, varieties: [], employees: [] });
    try {
      const { varieties, employees, cutStages, notice } = await harvestingApi.getGreenhouseData(greenhouse);
      set({ varieties, employees, cutStages, ghDataNotice: notice, ghDataLoading: false, cachedGreenhouse: greenhouse });
    } catch (err) {
      set({ ghDataError: mapAxiosError(err).message, ghDataLoading: false });
    }
  },

  createHarvest: async (payload) => {
    set({ acting: true });
    try {
      const r = await harvestingApi.createHarvest(payload);
      set({ acting: false });
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  resetGreenhouseData: () => set({
    varieties: [], employees: [], cutStages: [], cachedGreenhouse: null, ghDataError: null, ghDataNotice: null,
  }),
}));
