import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import { submitFieldReject, type FieldRejectPayload } from '@/src/services/field-rejects';
// Reused as-is from the harvesting flow (known-correct): varieties come from
// the Greenhouse's live planted ledger via getGreenhouseData, not a separate
// Item-group allow-list. See harvestingStore.loadGreenhouseData for the
// pattern this mirrors. Kept in a separate cache here (rather than reading
// harvestingStore directly) so this screen doesn't share/clobber state with
// the Harvesting screen's own greenhouse selection.
import { harvestingApi, type VarietyOption } from '@/src/services/harvesting';

type Outcome = { ok: true; name: string; message: string } | { ok: false; error: string };

interface FieldRejectsState {
  acting: boolean;
  submit: (payload: FieldRejectPayload) => Promise<Outcome>;

  /** Varieties actually standing in the selected greenhouse (real Items,
   *  with Spray/Standard classification) -- replaces the old Production
   *  Settings item-group allow-list, which only ever surfaced whatever
   *  handful of groups happened to be configured there. */
  varieties: VarietyOption[];
  varietiesLoading: boolean;
  varietiesError: string | null;
  cachedGreenhouse: string | null;
  loadVarietiesForGreenhouse: (greenhouse: string) => Promise<void>;
  resetVarieties: () => void;
}

export const useFieldRejectsStore = create<FieldRejectsState>((set, get) => ({
  acting: false,
  submit: async (payload) => {
    set({ acting: true });
    try {
      const r = await submitFieldReject(payload);
      set({ acting: false });
      return { ok: true, name: r.name, message: r.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  varieties: [],
  varietiesLoading: false,
  varietiesError: null,
  cachedGreenhouse: null,

  loadVarietiesForGreenhouse: async (greenhouse) => {
    if (!greenhouse) {
      set({ varieties: [], cachedGreenhouse: null, varietiesError: null });
      return;
    }
    if (get().cachedGreenhouse === greenhouse) return;
    set({ varietiesLoading: true, varietiesError: null, varieties: [] });
    try {
      const { varieties } = await harvestingApi.getGreenhouseData(greenhouse);
      set({ varieties, cachedGreenhouse: greenhouse, varietiesLoading: false });
    } catch (err) {
      set({ varietiesError: mapAxiosError(err).message, varietiesLoading: false });
    }
  },

  resetVarieties: () => set({ varieties: [], cachedGreenhouse: null, varietiesError: null }),
}));
