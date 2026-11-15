import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * QUELLE LISTE « QUI A RÉAGI » EST OUVERTE (#10583) — une pilule de réaction
 * vit au fond de trois peaux (bulle, ligne basse de la rangée plate, bande de
 * l'élu Focal) ; la feuille qu'elle ouvre est montée UNE fois, par l'hôte des
 * feuilles du fil (`routes/thread-sheets.tsx`). Entre les deux, une demande :
 * la pilule nomme son message, l'hôte monte la feuille. Même mécanique que la
 * feuille d'envoi (`send/send-sheet-store.ts`).
 *
 * Un hôte SANS feuille (l'administration, lecture seule) ne remet pas
 * `reactorsFor` à ses pilules : aucune demande ne part vers personne.
 */
export type ReactorsSheetState = {
  readonly messageId: string | null;
  open(messageId: string): void;
  close(): void;
};

export function createReactorsSheetStore(): StoreApi<ReactorsSheetState> {
  return createStore<ReactorsSheetState>((set, get) => ({
    messageId: null,
    open: (messageId) => {
      if (get().messageId !== messageId) set({ messageId });
    },
    close: () => {
      if (get().messageId !== null) set({ messageId: null });
    },
  }));
}

export const reactorsSheetStore = createReactorsSheetStore();

export const openReactorsSheet = (messageId: string): void => reactorsSheetStore.getState().open(messageId);

export const closeReactorsSheet = (): void => reactorsSheetStore.getState().close();
