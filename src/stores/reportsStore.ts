import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import { reportsApi, type HarvestReport } from '@/src/services/reports';
import { todayISO } from '@/src/date';

interface ReportsState {
  date: string;
  farm: string;
  report: HarvestReport | null;
  loading: boolean;
  error: string | null;
  setDate: (iso: string) => void;
  setFarm: (farm: string) => void;
  load: () => Promise<void>;
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  date: todayISO(),
  farm: '',
  report: null,
  loading: false,
  error: null,
  setDate: (iso) => set({ date: iso }),
  setFarm: (farm) => set({ farm }),
  load: async () => {
    set({ loading: true, error: null });
    try {
      const report = await reportsApi.harvestReport(get().date, get().farm || undefined);
      set({ report, loading: false });
    } catch (err) {
      set({ error: mapAxiosError(err).message, loading: false, report: null });
    }
  },
}));
