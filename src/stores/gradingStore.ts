import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import { gradingApi, type BunchEntry, type GradingPayload } from '@/src/services/grading';

type Outcome = { ok: true; message: string } | { ok: false; error: string };

interface GradingState {
  acting: boolean;
  validateAndGrade: (
    payload: GradingPayload,
  ) => Promise<{ ok: true; entry: BunchEntry; message: string } | { ok: false; error: string; alreadyGraded?: boolean }>;
}

export const useGradingStore = create<GradingState>((set) => ({
  acting: false,
  validateAndGrade: async (payload) => {
    set({ acting: true });
    try {
      const entry = await gradingApi.fetchBunch(payload.bunch_id);
      if (entry.scannedGrading === 1) {
        set({ acting: false });
        return { ok: false, error: 'This bunch has already been graded.', alreadyGraded: true };
      }
      const result = await gradingApi.createGrading(payload);
      set({ acting: false });
      return { ok: true, entry, message: result.message };
    } catch (err) {
      set({ acting: false });
      return { ok: false, error: mapAxiosError(err).message };
    }
  },
}));
