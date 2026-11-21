import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * L'AVIS D'UN ENVOI REDIRIGÉ (#20075) — posé par `sendWithheld`
 * (`readable-redirect.ts`), lu par la conversation d'arrivée
 * (`readable-redirect-notice.tsx`). Seul module que le fil ordinaire tire.
 */
/** `quoteDropped` : le message répondait à une citation, qui n'a pas suivi (#20197). */
export type ReadableRedirectNotice = { readonly conversationId: string; readonly peerName: string; readonly quoteDropped: boolean };

export type ReadableRedirectNoticeState = {
  readonly notice: ReadableRedirectNotice | null;
  post(notice: ReadableRedirectNotice): void;
  clear(conversationId: string): void;
};

/** L'avis que la conversation d'arrivée affiche au-dessus de son composeur, le temps de le lire. */
export const createReadableRedirectNotices = (): StoreApi<ReadableRedirectNoticeState> =>
  createStore<ReadableRedirectNoticeState>((set) => ({
    notice: null,
    post: (notice) => set({ notice }),
    clear: (conversationId) => set((state) => (state.notice?.conversationId === conversationId ? { notice: null } : state)),
  }));

export const readableRedirectNotices = createReadableRedirectNotices();
