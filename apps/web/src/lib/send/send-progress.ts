import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * LA PROGRESSION D'ENVOI PAR MESSAGE (#16134, jumelle web de #14702) — la
 * fraction de téléversement de CHAQUE bulle optimiste, indexée par son
 * `clientMessageId`. Hors de l'outbox : l'outbox porte l'état d'un envoi, pas
 * un compteur qui bouge à chaque tranche TUS. Seule la pastille de la bulle
 * concernée s'abonne (`Check`), bornée à 1 % : un point gagné ne redessine
 * que SA pastille, jamais le fil.
 */
export type SendProgressState = {
  readonly fractions: Readonly<Record<string, number>>;
  report(clientMessageId: string, fraction: number): void;
  clear(clientMessageId: string): void;
};

const percentOf = (fraction: number): number => Math.round(fraction * 100);
const clamped = (fraction: number): number => Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));

export function createSendProgressStore(): StoreApi<SendProgressState> {
  return createStore<SendProgressState>((set, get) => ({
    fractions: {},
    report: (clientMessageId, fraction) => {
      const next = clamped(fraction);
      const known = get().fractions[clientMessageId];
      if (known !== undefined && percentOf(known) === percentOf(next)) return;
      set((state) => ({ fractions: { ...state.fractions, [clientMessageId]: next } }));
    },
    clear: (clientMessageId) => {
      if (get().fractions[clientMessageId] === undefined) return;
      set((state) => {
        const { [clientMessageId]: _gone, ...rest } = state.fractions;
        return { fractions: rest };
      });
    },
  }));
}

export const sendProgressStore = createSendProgressStore();

/** La fraction d'un message : chaque fichier pèse son nombre d'octets. */
export function transferFraction(sizes: readonly number[], fractions: readonly number[]): number {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= 0) return 0;
  return sizes.reduce((sum, size, index) => sum + size * clamped(fractions[index] ?? 0), 0) / total;
}
