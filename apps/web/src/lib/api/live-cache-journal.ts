import {
  partialMatchKey,
  replaceEqualDeep,
  type QueryClient,
  type QueryFunction,
  type QueryFunctionContext,
  type QueryKey,
} from '@tanstack/react-query';

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
 * Désormais, une écriture VIVE (`writeLive`, qu'empruntent `patchConversation`,
 * `patchConversationDetail`, `patchThreadMessages` et `upsertThreadMessage`)
 * faite pendant une relecture est notée, puis REJOUÉE sur sa réponse dans
 * `structuralSharing` : TanStack l'appelle de façon synchrone, avant de
 * notifier le moindre observateur, qui ne voit donc jamais l'état d'avant
 * revenir. Le journal suit la donnée (clé : l'objet en cache) et repart de
 * zéro à chaque relecture qui commence ou échoue.
 *
 * `structuralSharing` reçoit TOUTE donnée qui entre dans une requête — la
 * réponse d'une relecture comme une écriture locale. Seule la réponse rejoue
 * le journal : la rejouer après une écriture locale la déferait. La réponse
 * se reconnaît à l'objet exact que rend la relecture, marqué au passage par le
 * crochet `persister` de TanStack, qui enveloppe l'appel de la `queryFn` —
 * toutes les pages d'une requête infinie comprises. Toute autre écriture PORTE
 * le journal jusqu'à la donnée qu'elle produit.
 *
 * Trois règles pour qui écrit :
 *  - une écriture vive garde la date de la dernière LECTURE serveur
 *    (`updatedAt`) : le temps réel ne fait pas passer un cache pour frais
 *    (WEB-08) ;
 *  - un delta RELATIF (`relative: true`, ma réaction +1) n'est jamais rejoué :
 *    la réponse le compte peut-être déjà ;
 *  - ce qui est rejoué se calcule SUR la donnée reçue, jamais sur un
 *    instantané pris avant elle : rejoué sur une réponse plus fraîche,
 *    l'instantané la ferait reculer.
 */
export const LIVE_CACHE_ROOT = ['conversations'] as const;

export type LiveWriteOptions = {
  /** Un delta (±1) plutôt qu'une valeur : appliqué une fois, jamais rejoué. */
  readonly relative?: boolean;
};

type Replay = (data: unknown) => unknown;

const journals = new WeakMap<object, readonly Replay[]>();
const servedResponses = new WeakSet<object>();
const installed = new WeakSet<QueryClient>();

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

const replayed = (writes: readonly Replay[], response: unknown): unknown =>
  writes.reduce((data, write) => write(data) ?? data, response);

function shareWithLiveWrites(previous: unknown, next: unknown): unknown {
  const writes = isObject(previous) ? journals.get(previous) : undefined;
  if (isObject(next) && servedResponses.delete(next)) return replaceEqualDeep(previous, writes === undefined ? next : replayed(writes, next));
  const shared = replaceEqualDeep(previous, next);
  if (writes !== undefined && isObject(shared)) journals.set(shared, writes);
  return shared;
}

async function markServed(queryFn: QueryFunction<unknown, QueryKey, never>, context: QueryFunctionContext<QueryKey>): Promise<unknown> {
  const response = await queryFn(context);
  if (isObject(response)) servedResponses.add(response);
  return response;
}

export function installLiveCacheJournal(queryClient: QueryClient): void {
  if (installed.has(queryClient)) return;
  installed.add(queryClient);
  queryClient.setQueryDefaults(LIVE_CACHE_ROOT, { structuralSharing: shareWithLiveWrites, persister: markServed });
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || !isObject(event.query.state.data)) return;
    if (event.action.type === 'fetch' || event.action.type === 'error') journals.delete(event.query.state.data);
  });
}

/**
 * Écrit `updater` dans `queryKey` sans rajeunir la donnée ; pendant une
 * relecture d'une clé de la racine, le note pour le rejouer sur sa réponse.
 */
export function writeLive<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (data: T | undefined) => T | undefined,
  options: LiveWriteOptions = {},
): void {
  const query = queryClient.getQueryCache().find<T>({ queryKey, exact: true });
  if (query === undefined || query.state.data === undefined) return;
  queryClient.setQueryData<T>(queryKey, updater, { updatedAt: query.state.dataUpdatedAt });
  const written = query.state.data;
  const journaled = installed.has(queryClient) && options.relative !== true && query.state.fetchStatus !== 'idle' && partialMatchKey(queryKey, LIVE_CACHE_ROOT);
  if (!journaled || !isObject(written)) return;
  /* Le journal d'une requête ne reçoit jamais que SA donnée : `T`. */
  journals.set(written, [...(journals.get(written) ?? []), (data) => updater(data as T)]);
}
