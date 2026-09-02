import { create } from 'zustand';

/** Shared UI chrome state — kept tiny on purpose. Anything bigger should live
 *  in a feature store. */
interface UIState {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /** Y-coordinate of the currently-open Sheet's panel top edge, in screen
   *  coordinates. Set by Sheet via onLayout; consumed by the FAB so its
   *  expanded position lands AT the sheet's top-right corner. */
  sheetTopY: number | null;
  setSheetTopY: (y: number | null) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set({ drawerOpen: !get().drawerOpen }),
  sheetTopY: null,
  setSheetTopY: (y) => set({ sheetTopY: y }),
}));
