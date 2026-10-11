import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import { submitFieldReject, type FieldRejectPayload } from '@/src/services/field-rejects';

type Outcome = { ok: true; name: string; message: string } | { ok: false; error: string };

interface FieldRejectsState {
  acting: boolean;
  submit: (payload: FieldRejectPayload) => Promise<Outcome>;
}

export const useFieldRejectsStore = create<FieldRejectsState>((set) => ({
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
}));
