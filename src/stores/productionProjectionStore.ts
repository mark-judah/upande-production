import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import {
  productionProjectionApi,
  type ProductionProjection,
  type ProjectionUpdateRow,
} from '@/src/services/production-projection';

type Outcome = { ok: true; message: string } | { ok: false; error: string };

interface State {
  projection: ProductionProjection | null;
  loading: boolean;
  error: string | null;
  acting: boolean;

  fetch: (greenhouse: string, variety: string, year: string) => Promise<void>;
  save: (rows: ProjectionUpdateRow[]) => Promise<Outcome>;
  clear: () => void;
}

export const useProductionProjectionStore = create<State>((set, get) => ({
  projection: null,
  loading: false,
  error: null,
  acting: false,

  fetch: async (greenhouse, variety, year) => {
    set({ loading: true, error: null, projection: null });
    try {
      const projection = await productionProjectionApi.fetchProjection(greenhouse, variety, year);
      set({ projection, loading: false });
    } catch (err) {
      set({ error: mapAxiosError(err).message, loading: false });
    }
  },

  save: async (rows) => {
    const projection = get().projection;
    if (!projection) return { ok: false, error: 'No projection loaded.' };
    set({ acting: true });
    try {
      const { message } = await productionProjectionApi.updateRevisedForecast(projection.name, rows);
      // Merge edits back into the projection so the UI reflects the new values
      // without needing a round-trip.
      const editsByName = new Map(rows.map((r) => [r.name, r]));
      const newWeeks = projection.weeks.map((w) => {
        const e = editsByName.get(w.name);
        if (!e) return w;
        return {
          ...w,
          revisedForecast: e.revised_forecast ?? w.revisedForecast,
          customComment: e.custom_comment ?? w.customComment,
        };
      });
      set({ projection: { ...projection, weeks: newWeeks }, acting: false });
      return { ok: true, message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },

  clear: () => set({ projection: null, error: null }),
}));
