import type { InfiniteData } from '@tanstack/react-query';

import { unwrap } from './client';
import type { ConversationsDeps } from './conversations';
import { messagesOf } from './fixtures';
import type { ApiResult } from './http';
import { messagesQueryKey, requestMessageRows } from './messages';
import { flattenMessagePages, nextMessagesCursor, timeOf, type MessagesPage } from './messages-pages';
import type { Message } from './types';

/**
 * **LA FENÊTRE AUTOUR D'UN MESSAGE** (#7420) — miroir de
 * `ConversationViewModel.loadMessagesAround` / `jumpToQuotedMessage` iOS
 * (`ConversationViewModel+JumpToMessage.swift`).
 *
 * Un message plus ancien que les pages chargées (un favori, une citation, une
 * adresse `?message=`) s'atteignait en chargeant les pages plus anciennes UNE À
 * UNE (#8320) : N allers-retours SÉQUENTIELS pour un message N pages plus haut,
 * plafonnés à 20 pages — au-delà de mille messages, le message était
 * inatteignable. La passerelle sert la fenêtre en UNE requête :
 * `GET …/messages?around=<id>&limit=50` (`messages-list.ts`, `allowsAround` de
 * la chronologie) rend 25 messages avant la cible, la cible, 25 après, plus
 * `cursorPagination.hasMore` (du plus ancien existe) et `hasNewer` (du plus
 * récent existe).
 *
 * LA FENÊTRE VIT SOUS SA PROPRE CLÉ, jamais dans le cache du présent :
 * `['conversations', id, 'messages', 'around', messageId]`. Le présent garde
 * ses arrivées en temps réel, ses envois et sa persistance ; la fenêtre ancrée
 * n'est qu'un moment de navigation. Elle s'étend vers le PASSÉ (`before`) et
 * vers le PRÉSENT (`after=<instant du plus récent servi>`, le filigrane que la
 * passerelle sert en ordre ascendant) jusqu'à toucher le présent — alors
 * `joinThreadWindows` recolle les deux en un fil continu.
 *
 * LES PAGES SONT RANGÉES COMME CELLES DU PRÉSENT : `pages[0]` la plus récente,
 * chaque page ASCENDANTE en interne, si bien que `flattenMessagePages` les
 * recolle sans rien savoir de plus. Une page vers le présent est donc posée
 * EN TÊTE (`fetchPreviousPage`), une page vers le passé en QUEUE
 * (`fetchNextPage`).
 */
export type WindowPage = MessagesPage & { readonly hasNewer: boolean };

export type WindowPageParam =
  | { readonly around: string }
  | { readonly before: string }
  | { readonly after: string };

export type WindowData = InfiniteData<WindowPage, WindowPageParam>;

const WINDOW_LIMIT = 50;

export const anchoredMessagesQueryKey = (conversationId: string, messageId: string) =>
  [...messagesQueryKey(conversationId), 'around', messageId] as const;

const ascending = (corpus: readonly Message[]): readonly Message[] =>
  [...corpus].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));

const pageOf = (rows: readonly Message[], flags: { readonly hasOlder: boolean; readonly hasNewer: boolean }): WindowPage => ({
  messages: rows,
  hasOlder: flags.hasOlder,
  hasNewer: flags.hasNewer,
  nextCursor: flags.hasOlder ? (rows[0]?.id ?? null) : null,
});

/**
 * `windowPageOf` — LA LOI DE LA PASSERELLE, pour la source `fixtures` (même
 * discipline que `pageOfMessages`) :
 *  - `around` : `limit/2` avant, la cible, `limit/2` après ; une cible
 *    INCONNUE rend la page récente sans plus récent — la passerelle ne pose
 *    alors aucun filtre d'id ;
 *  - `before` : strictement plus ancien que le curseur ;
 *  - `after` : strictement plus récent que le filigrane, ascendant.
 */
export function windowPageOf(corpus: readonly Message[], param: WindowPageParam, limit: number): WindowPage {
  const rows = ascending(corpus);
  if ('after' in param) {
    const mark = new Date(param.after).getTime();
    const newer = rows.filter((m) => timeOf(m.createdAt) > mark);
    return pageOf(newer.slice(0, limit), { hasOlder: true, hasNewer: newer.length > limit });
  }
  if ('before' in param) {
    const cursor = rows.find((m) => m.id === param.before);
    const older = cursor === undefined ? rows : rows.filter((m) => timeOf(m.createdAt) < timeOf(cursor.createdAt));
    return pageOf(older.slice(-limit), { hasOlder: older.length > limit, hasNewer: false });
  }
  const index = rows.findIndex((m) => m.id === param.around);
  if (index === -1) return pageOf(rows.slice(-limit), { hasOlder: rows.length > limit, hasNewer: false });
  const half = Math.floor(limit / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(rows.length, index + half + 1);
  return pageOf(rows.slice(start, end), { hasOlder: start > 0, hasNewer: end < rows.length });
}

const queryOf = (param: WindowPageParam): Readonly<Record<string, string>> => ({
  limit: String(WINDOW_LIMIT),
  ...('around' in param ? { around: param.around } : 'before' in param ? { before: param.before } : { after: param.after }),
});

/**
 * `loadMessagesWindow` — UNE page de la fenêtre ancrée. La passerelle sert
 * `around` et `before` en ordre DÉCROISSANT (la vue chronologie), `after` en
 * ordre CROISSANT (le rattrapage par filigrane) : seule la page servie
 * décroissante se renverse. `after` ne publie aucun curseur arrière
 * (`nextCursor: null`, par contrat) : le plus ancien de la page en tient lieu,
 * pour qu'une revalidation de la fenêtre redescende sans trou.
 */
export async function loadMessagesWindow(
  params: ConversationsDeps & {
    readonly conversationId: string;
    readonly param: WindowPageParam;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<WindowPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    return { ok: true, data: windowPageOf(messagesOf(params.conversationId), params.param, WINDOW_LIMIT) };
  }
  const served = await requestMessageRows({ ...params, query: queryOf(params.param) });
  if (!served.ok) return served;
  const { rows, hasMore, nextCursor, hasNewer } = served.data;
  if ('after' in params.param) return { ok: true, data: pageOf(rows, { hasOlder: true, hasNewer: hasMore }) };
  return {
    ok: true,
    data: { messages: [...rows].reverse(), hasOlder: hasMore, nextCursor, hasNewer: 'around' in params.param && hasNewer },
  };
}

/** `getNextPageParam` de la fenêtre — vers le PASSÉ, les mêmes cinq refus que le présent (`nextMessagesCursor`). */
export function olderWindowParam(
  lastPage: WindowPage,
  allPages: readonly WindowPage[],
  lastPageParam: WindowPageParam,
): WindowPageParam | undefined {
  const before = nextMessagesCursor(lastPage, allPages, 'before' in lastPageParam ? lastPageParam.before : undefined);
  return before === undefined ? undefined : { before };
}

/**
 * `getPreviousPageParam` de la fenêtre — vers le PRÉSENT : le filigrane est
 * l'instant du message le plus récent de la première page. Aucun appel quand
 * le présent est atteint, sur une page vide, ou quand le filigrane STAGNE
 * (la page qu'il vient de servir n'a rien ajouté).
 */
export function newerWindowParam(
  firstPage: WindowPage,
  _allPages: readonly WindowPage[],
  firstPageParam: WindowPageParam,
): WindowPageParam | undefined {
  if (!firstPage.hasNewer) return undefined;
  const newest = firstPage.messages[firstPage.messages.length - 1];
  if (newest === undefined) return undefined;
  const after = new Date(timeOf(newest.createdAt)).toISOString();
  if ('after' in firstPageParam && firstPageParam.after === after) return undefined;
  return { after };
}

/** Ce que l'écran lit de la fenêtre ancrée — aplatie, décodée, bornée. */
export type AnchoredWindow = {
  readonly messages: readonly Message[];
  readonly hasOlder: boolean;
  readonly hasNewer: boolean;
};

/** `select` de la fenêtre — fonction de MODULE (voir `flattenMessagePages`). */
export function anchoredWindowOf(data: WindowData): AnchoredWindow {
  return {
    messages: flattenMessagePages(data),
    hasOlder: data.pages[data.pages.length - 1]?.hasOlder ?? false,
    hasNewer: data.pages[0]?.hasNewer ?? false,
  };
}

/**
 * La fenêtre ancrée, spreadable dans `useInfiniteQuery`. **Jamais revalidée
 * d'elle-même** (`staleTime: Infinity`, ni au focus ni à la reconnexion) : le
 * temps réel la tient à jour par `patchThreadMessages`, et une revalidation
 * rechargerait des pages dont le lecteur n'a pas besoin. Une invalidation
 * explicite (le préfixe du fil) la relit sans trou : la première page rejoue
 * son propre paramètre, les suivantes descendent par `before`.
 */
export function anchoredMessagesQuery(deps: ConversationsDeps, conversationId: string, messageId: string) {
  return {
    queryKey: anchoredMessagesQueryKey(conversationId, messageId),
    queryFn: async ({ pageParam, signal }: { readonly pageParam: WindowPageParam; readonly signal?: AbortSignal }) =>
      unwrap(await loadMessagesWindow({ ...deps, conversationId, param: pageParam, ...(signal !== undefined ? { signal } : {}) })),
    initialPageParam: { around: messageId } as WindowPageParam,
    getNextPageParam: olderWindowParam,
    getPreviousPageParam: newerWindowParam,
    select: anchoredWindowOf,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  };
}

/**
 * `joinThreadWindows` — CE QUE LE FIL MONTRE quand une fenêtre est ancrée.
 *
 * - Aucune fenêtre : le présent, À L'IDENTIQUE (même référence — la
 *   mémoïsation de `place()` et du fil virtualisé en dépend).
 * - Une fenêtre qui ne touche pas le présent (`hasNewer`, aucun message en
 *   commun) est DÉTACHÉE : elle seule est servie. Coller le présent dessous
 *   laisserait un TROU entre les deux, sans rien qui le dise.
 * - Une fenêtre qui chevauche le présent, ou qui l'a atteint, le REJOINT : la
 *   fenêtre, puis ce que le présent porte de plus récent qu'elle — un fil
 *   continu, sans doublon, où les arrivées en temps réel (écrites dans le
 *   présent) apparaissent.
 */
export function joinThreadWindows(
  present: readonly Message[],
  anchored: AnchoredWindow | undefined,
): { readonly messages: readonly Message[]; readonly detached: boolean } {
  if (anchored === undefined) return { messages: present, detached: false };
  const ids = new Set(anchored.messages.map((m) => m.id));
  const overlaps = present.some((m) => ids.has(m.id));
  if (anchored.hasNewer && !overlaps) return { messages: anchored.messages, detached: true };
  const newest = anchored.messages[anchored.messages.length - 1];
  const mark = newest === undefined ? Number.NEGATIVE_INFINITY : timeOf(newest.createdAt);
  const tail = present.filter((m) => !ids.has(m.id) && timeOf(m.createdAt) > mark);
  return { messages: tail.length === 0 ? anchored.messages : [...anchored.messages, ...tail], detached: false };
}
