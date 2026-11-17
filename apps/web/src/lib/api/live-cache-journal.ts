import { replaceEqualDeep, type QueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * **LE JOURNAL DES ÉCRITURES VIVES** (#18914, WEB-04 et M1).
 *
 * Une relecture de la liste, d'une fiche ou d'un fil remplace le cache par sa
 * réponse — partie AVANT ce que le temps réel ou un geste viennent d'écrire.
 * Un message supprimé ressuscitait, un compte de non-lus soldé revenait, une
 * coche redescendait. Le remède d'avant relançait la relecture à chaque
 * écriture : trois écrivains seulement, une relance sans fin sous un flux de
 * messages, et la page plus ancienne qu'on remontait annulée.
 *
 * Désormais, une écriture VIVE (`writeLive`, que `patchConversation`,
 * `patchConversationDetail`, `patchThreadMessages` et `upsertThreadMessage`
 * empruntent) faite pendant une relecture est notée, puis REJOUÉE sur la
 * réponse dans `structuralSharing` : TanStack l'appelle de façon synchrone
 * avant de notifier le moindre observateur, qui ne voit donc jamais l'état
 * d'avant revenir. Le journal suit la donnée (clé : l'objet en cache), se
 * vide quand la relecture aboutit, échoue ou repart, et n'existe que sur un
 * client où il est posé (`installLiveCacheJournal`, `createAppQueryClient`).
 *
 * Deux règles :
 *  - une écriture vive garde la date de la dernière LECTURE serveur
 *    (`updatedAt`) : le temps réel ne fait pas passer un cache pour frais
 *    (WEB-08) ;
 *  - un delta RELATIF (`relative: true`, ma réaction +1) n'est jamais rejoué :
 *    la réponse le compte peut-être déjà. Ce qui est rejoué doit être absolu
 *    ou idempotent, et calculé depuis la donnée reçue.
 */
export const LIVE_CACHE_ROOT = ['conversations'] as const;

export type LiveWriteOptions = {
  /** Un delta (±1) plutôt qu'une valeur : appliqué une fois, jamais rejoué. */
  readonly relative?: boolean;
};

type Replay = (data: unknown) => unknown;

const journals = new WeakMap<object, readonly Replay[]>();
const installed = new WeakSet<QueryClient>();
const writing = { live: false };

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

function replayLiveWrites(previous: unknown, next: unknown): unknown {
  const writes = writing.live || !isObject(previous) ? undefined : journals.get(previous);
  if (writes === undefined) return replaceEqualDeep(previous, next);
  const replayed = replaceEqualDeep(previous, writes.reduce((data, write) => write(data), next));
  if (isObject(replayed)) journals.set(replayed, writes);
  return replayed;
}

export function installLiveCacheJournal(queryClient: QueryClient): void {
  if (installed.has(queryClient)) return;
  installed.add(queryClient);
  queryClient.setQueryDefaults(LIVE_CACHE_ROOT, { structuralSharing: replayLiveWrites });
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || !isObject(event.query.state.data)) return;
    const { action } = event;
    const settled = action.type === 'fetch' || action.type === 'error' || (action.type === 'success' && action.manual !== true);
    if (settled) journals.delete(event.query.state.data);
  });
}

/**
 * Écrit `updater` dans `queryKey` sans rajeunir la donnée ; pendant une
 * relecture, le note pour la rejouer sur sa réponse.
 */
export function writeLive<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (data: T | undefined) => T | undefined,
  options: LiveWriteOptions = {},
): void {
  const query = queryClient.getQueryCache().find<T>({ queryKey, exact: true });
  if (query === undefined || query.state.data === undefined) return;
  const before = query.state.data;
  writing.live = true;
  try {
    queryClient.setQueryData<T>(queryKey, updater, { updatedAt: query.state.dataUpdatedAt });
  } finally {
    writing.live = false;
  }
  const after = query.state.data;
  if (options.relative === true || !installed.has(queryClient) || query.state.fetchStatus === 'idle' || !isObject(after)) return;
  const earlier = isObject(before) ? (journals.get(before) ?? []) : [];
  journals.set(after, [...earlier, (data) => updater(data as T) as unknown]);
}
