import {
  partialMatchKey,
  replaceEqualDeep,
  type Query,
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
 * revenir. Le journal suit la REQUÊTE EN VOL (#19118) — pas la donnée
 * présente : une écriture faite pendant la PREMIÈRE lecture d'un fil ou de la
 * liste, cache vide, n'a rien à écrire, mais elle est notée et rejouée sur la
 * réponse ; sans cela, un message reçu pendant l'ouverture à froid n'apparaissait
 * qu'à la relecture suivante. Le journal repart de zéro à chaque lecture qui
 * commence ou échoue, et sa réponse le consomme.
 *
 * `structuralSharing` reçoit TOUTE donnée qui entre dans une requête — la
 * réponse d'une relecture comme une écriture locale. Seule la réponse rejoue
 * le journal : la rejouer après une écriture locale la déferait. La réponse
 * se reconnaît à l'objet exact que rend la relecture, marqué au passage — avec
 * la requête qui l'a demandée — par le crochet `persister` de TanStack, qui
 * enveloppe l'appel de la `queryFn`, toutes les pages d'une requête infinie
 * comprises. Une autre écriture laisse le journal à sa requête.
 *
 * Ce crochet a un effet de bord, neutralisé dans le même appel : sans mode
 * réseau fixé, TanStack passe toute requête qui porte un `persister` en
 * `offlineFirst` (`defaultQueryOptions`). Hors ligne, la liste, la fiche et le
 * fil partaient au lieu d'attendre ; le service worker servait sa copie, qui
 * remplaçait ce que le temps réel avait posé. La racine reste `online` : hors
 * ligne, elle est EN PAUSE, comme le reste du produit (`lib/view/cold-state.ts`).
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

/** Le journal de chaque requête en vol — la requête est la clé, sa donnée peut ne pas exister encore. */
const journals = new WeakMap<object, readonly Replay[]>();
/** La réponse d'une lecture, et la requête qui l'a demandée. */
const servedBy = new WeakMap<object, object>();
const installed = new WeakSet<QueryClient>();

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

const replayed = (writes: readonly Replay[], response: unknown): unknown =>
  writes.reduce((data, write) => write(data) ?? data, response);

function shareWithLiveWrites(previous: unknown, next: unknown): unknown {
  const query = isObject(next) ? servedBy.get(next) : undefined;
  if (query === undefined) return replaceEqualDeep(previous, next);
  servedBy.delete(next as object);
  const writes = journals.get(query);
  journals.delete(query);
  return replaceEqualDeep(previous, writes === undefined ? next : replayed(writes, next));
}

async function markServed(queryFn: QueryFunction<unknown, QueryKey, never>, context: QueryFunctionContext<QueryKey>, query: Query): Promise<unknown> {
  const response = await queryFn(context);
  if (isObject(response)) servedBy.set(response, query);
  return response;
}

export function installLiveCacheJournal(queryClient: QueryClient): void {
  if (installed.has(queryClient)) return;
  installed.add(queryClient);
  queryClient.setQueryDefaults(LIVE_CACHE_ROOT, { structuralSharing: shareWithLiveWrites, persister: markServed, networkMode: 'online' });
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return;
    if (event.action.type === 'fetch' || event.action.type === 'error') journals.delete(event.query);
  });
}

/**
 * Écrit `updater` dans `queryKey` sans rajeunir la donnée ; pendant une
 * lecture d'une clé de la racine — la première comprise, cache vide —, le
 * note pour le rejouer sur sa réponse.
 */
export function writeLive<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (data: T | undefined) => T | undefined,
  options: LiveWriteOptions = {},
): void {
  const query = queryClient.getQueryCache().find<T>({ queryKey, exact: true });
  if (query === undefined) return;
  if (query.state.data !== undefined) queryClient.setQueryData<T>(queryKey, updater, { updatedAt: query.state.dataUpdatedAt });
  const journaled = installed.has(queryClient) && options.relative !== true && query.state.fetchStatus !== 'idle' && partialMatchKey(queryKey, LIVE_CACHE_ROOT);
  /* Le journal d'une requête ne reçoit jamais que SA donnée : `T`. */
  if (journaled) journals.set(query, [...(journals.get(query) ?? []), (data) => updater(data as T)]);
}
