import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import { reportsApi, type HarvestReport } from '@/src/services/reports';
import { todayISO } from '@/src/date';

interface ReportsState {
  fromDate: string;
  toDate: string;
  farm: string;
  report: HarvestReport | null;
  loading: boolean;
  error: string | null;
  setRange: (from: string, to: string) => void;
  setFarm: (farm: string) => void;
  load: () => Promise<void>;
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  fromDate: todayISO(),
  toDate: todayISO(),
  farm: '',
  report: null,
  loading: false,
  error: null,
  setRange: (fromDate, toDate) => set({ fromDate, toDate }),
  setFarm: (farm) => set({ farm }),
  load: async () => {
    set({ loading: true, error: null });
    try {
      const report = await reportsApi.harvestReport(get().fromDate, get().toDate, get().farm || undefined);
      set({ report, loading: false });
    } catch (err) {
      set({ error: mapAxiosError(err).message, loading: false, report: null });
    }
  },
}));
