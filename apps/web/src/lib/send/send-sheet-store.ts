import { createStore, type StoreApi } from 'zustand/vanilla';

import type { SendPayload } from './send-sheet-plan';

/**
 * L'OUVERTURE DE LA FEUILLE D'ENVOI (#8884) — le magasin que TOUTE entrée
 * actionne : le menu d'un message (transfert), une visionneuse plein écran, le
 * partage d'une publication, l'image venue de l'extérieur. Un seul geste
 * (`openSendSheet`), un seul hôte monté à la racine qui s'y abonne — l'entrée
 * ne monte jamais sa propre feuille.
 *
 * Sans dépendance à la vue (motif `conversation-store.ts`, `zustand/vanilla`) :
 * mémoire seule, rien de persisté. `intent` ne change PAS ce qui part (le plan
 * dépend du contenu et des cibles) mais le VOCABULAIRE de la feuille —
 * « Transférer » pour un message, « Partager » pour le reste.
 */
export type SendSheetIntent = 'forward' | 'share';

export type SendSheetRequest = {
  readonly payload: SendPayload;
  readonly intent: SendSheetIntent;
  /** « Plus d’options… » : la feuille système, avec l’adresse à partager. */
  readonly moreOptions?: { readonly url?: string };
  /**
   * Appelé UNE fois quand le partage est réellement parti — un envoi abouti à
   * une conversation ou une publication, ou « Plus d’options… » / « Copier le
   * lien » : l'entrée y accroche son compteur (`POST /posts/:id/share`).
   * Jamais à l'ouverture, jamais sur un envoi refusé.
   */
  readonly onShared?: () => void;
};

export type SendSheetState = {
  readonly request: SendSheetRequest | null;
  open(request: SendSheetRequest): void;
  close(): void;
};

export function createSendSheetStore(): StoreApi<SendSheetState> {
  return createStore<SendSheetState>((set, get) => ({
    request: null,
    open: (request) => set({ request }),
    close: () => {
      if (get().request !== null) set({ request: null });
    },
  }));
}

export const sendSheetStore = createSendSheetStore();

export const openSendSheet = (request: SendSheetRequest): void => sendSheetStore.getState().open(request);

export const closeSendSheet = (): void => sendSheetStore.getState().close();

export const subscribeSendSheet = (listener: (request: SendSheetRequest | null) => void): (() => void) =>
  sendSheetStore.subscribe((state) => listener(state.request));
