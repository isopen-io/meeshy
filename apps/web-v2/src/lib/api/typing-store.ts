import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * LE MAGASIN DE FRAPPE — CÔTÉ RÉCEPTION (#5793). Miroir
 * `ConversationListViewModel.swift:966-990`/`:1490-1514` : un frappeur
 * entré par `typing:start` disparaît sur `typing:stop`, OU — à défaut, un
 * `stop` qui se perd (déconnexion brutale du pair) — après
 * `TYPING_SAFETY_TIMEOUT_MS` sans nouveau `start` (le minuteur de 15 s
 * iOS, `:1490-1492`). La rangée survit tant qu'il reste au moins un
 * frappeur (`:1500-1514`) : `stop` retire SEULEMENT celui nommé.
 *
 * `zustand/vanilla`, motif `outbox-store.ts` : ce fichier ne sait rien de la
 * vue — `use-typists.ts` s'y abonne via `zustand/react`. Le minuteur de
 * SÉCURITÉ (le `setTimeout` qui appelle `stop` après 15 s) vit dans
 * `api/socket.ts`, qui possède déjà l'horloge de la connexion (motif
 * `outbox-store.ts` / `perform-send.ts` : la RÈGLE d'expiration est ici, son
 * DÉCLENCHEUR est chez l'appelant qui a une horloge à offrir) — ce magasin
 * reste un réducteur PUR, injectable en `now`.
 */
export const TYPING_SAFETY_TIMEOUT_MS = 15_000;

export type TypingEntry = {
  readonly userId: string;
  readonly displayName: string;
  /** Epoch ms — passé cette date, l'entrée est PÉRIMÉE (`typistsOf`) même si
   * personne n'a appelé `stop` (miroir iOS `:1490-1492`). */
  readonly expiresAt: number;
};

export type TypingState = {
  readonly byConversation: Readonly<Record<string, readonly TypingEntry[]>>;
  /** `typing:start` — REMPLACE l'entrée du même frappeur (repousse son
   * échéance), ne la double jamais. */
  start(conversationId: string, entry: { readonly userId: string; readonly displayName: string }, now: number): void;
  /** `typing:stop` — retire SEULEMENT ce frappeur ; la ligne survit tant
   * qu'il en reste un autre. */
  stop(conversationId: string, userId: string): void;
};

export type TypingStoreApi = StoreApi<TypingState>;

export function createTypingStore(): TypingStoreApi {
  return createStore<TypingState>((set) => ({
    byConversation: {},
    start: (conversationId, entry, now) =>
      set((state) => {
        const current = state.byConversation[conversationId] ?? [];
        const withoutSelf = current.filter((e) => e.userId !== entry.userId);
        return {
          byConversation: {
            ...state.byConversation,
            [conversationId]: [...withoutSelf, { ...entry, expiresAt: now + TYPING_SAFETY_TIMEOUT_MS }],
          },
        };
      }),
    stop: (conversationId, userId) =>
      set((state) => {
        const current = state.byConversation[conversationId];
        if (current === undefined) return state;
        const next = current.filter((e) => e.userId !== userId);
        if (next.length === current.length) return state;
        if (next.length === 0) {
          const { [conversationId]: _removed, ...rest } = state.byConversation;
          return { byConversation: rest };
        }
        return { byConversation: { ...state.byConversation, [conversationId]: next } };
      }),
  }));
}

/** L'INSTANCE UNIQUE — motif `outboxStore`/`conversationStore` (un magasin
 * par application, partagé par la connexion et par tout écran monté). */
export const typingStore: TypingStoreApi = createTypingStore();

const EMPTY: readonly TypingEntry[] = [];

/** Le sélecteur PUR — filtre les entrées PÉRIMÉES sans muter le magasin (le
 * ménage réel se fait par le minuteur de sécurité de l'appelant, jamais ici
 * : un sélecteur qui écrit romprait la règle « lire ne modifie jamais »). */
export function typistsOf(state: TypingState, conversationId: string, now: number): readonly TypingEntry[] {
  const entries = state.byConversation[conversationId];
  if (entries === undefined) return EMPTY;
  const alive = entries.filter((e) => e.expiresAt > now);
  return alive.length === entries.length ? entries : alive;
}

/**
 * LE NOM À AFFICHER SUR CHAQUE LIGNE DE LISTE (#5793, ligne 2 de la Lentille)
 * — `conversationId → nom du PREMIER frappeur vivant qui n'est pas le lecteur`.
 *
 * Rendu par CONVERSATION plutôt que par entrée : une rangée ne peut pas
 * appeler de hook (elle est rendue dans un `.map`), donc c'est l'ÉCRAN qui
 * s'abonne une fois et distribue — motif `effectiveFlagsOf`/`effectiveUnreadOf`
 * (`conversation-store.ts`), déjà la forme que `routes/conversations.tsx`
 * emploie pour les overrides.
 *
 * Fonction PURE, `now` injecté : c'est elle qui porte le témoin, pas le hook.
 */
export function typistNamesOf(
  state: Pick<TypingState, 'byConversation'>,
  viewerId: string,
  now: number,
): Readonly<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const [conversationId, entries] of Object.entries(state.byConversation)) {
    const first = entries.find((e) => e.userId !== viewerId && e.expiresAt > now);
    if (first !== undefined) names[conversationId] = first.displayName;
  }
  return names;
}
