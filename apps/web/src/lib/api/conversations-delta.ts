import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import type { ConversationsInfiniteData, ConversationsPage, ConversationsPageParam } from './conversations-pages';
import type { ApiResult, HttpTransport } from './http';
import type { Conversation } from './types';

/**
 * LE RAFRAÎCHISSEMENT DELTA DE LA LENTILLE (#6261) — ce qui change depuis la
 * dernière lecture, en UNE requête, au lieu de rejouer les N pages chargées
 * l'une après l'autre (le coût que D-44 nommait).
 *
 * La porte est `GET conversations.root?updatedSince=` (`core-list.ts`, la
 * MÊME que la page), pas `GET /sync` : `/sync` sert une ligne mince (ni
 * aperçu, ni non-lus, ni rôle du lecteur) que la liste ne sait pas peindre,
 * quand la page delta sert la ligne ENTIÈRE, décodée par la même loi, avec les
 * sorties de vue en `meta.deletedConversationIds`. C'est aussi la porte du
 * moteur iOS (`ConversationSyncEngine.deltaSyncCore`).
 */

/** Le plafond serveur (`CONVERSATION_LIST_PAGINATION.maxLimit`). */
export const DELTA_PAGE_LIMIT = 100;

/**
 * Retrait du watermark, miroir de `SYNC_CHECKPOINT_LAG_MS` côté passerelle :
 * `@updatedAt` est estampillé à la CONSTRUCTION de l'écriture, pas à son
 * commit, donc une ligne estampillée juste avant le plus récent `updatedAt`
 * servi peut n'être devenue visible qu'après. Relire quelques secondes de trop
 * ne coûte qu'un remplacement à l'identique.
 */
export const DELTA_WATERMARK_LAG_MS = 5_000;

/**
 * Le delta ne voit que ce qui bouge `Conversation.updatedAt`. Un non-lu
 * soldé sur un autre appareil pendant une coupure du socket, lui, ne le
 * bouge pas : une relecture COMPLÈTE reste due, bornée à une par intervalle
 * (iOS : `fullReconcileInterval`, 24 h — plus court ici, parce qu'un onglet
 * perd ses évènements à chaque coupure du socket).
 */
export const FULL_RECONCILE_INTERVAL_MS = 15 * 60_000;

export type ConversationsDelta = {
  readonly rows: readonly Conversation[];
  readonly deletedIds: readonly string[];
  /** Faux dès que la page ou les sorties sont tronquées : le delta ne
   * PROUVE alors pas qu'il a tout vu, et la relecture complète reprend. */
  readonly complete: boolean;
};

export async function loadConversationsDelta(params: {
  readonly transport: HttpTransport;
  readonly since: string;
  readonly signal?: AbortSignal;
}): Promise<ApiResult<ConversationsDelta>> {
  const query = new URLSearchParams({ limit: String(DELTA_PAGE_LIMIT), updatedSince: params.since });
  const result = await params.transport.request<readonly Conversation[]>({
    method: 'GET',
    path: `${conversationsEndpoints.root}?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const deleted = result.meta?.deletedConversationIds;
  const deletedIds = Array.isArray(deleted) ? deleted.filter((id): id is string => typeof id === 'string') : [];
  const hasMore = result.cursorPagination?.hasMore ?? result.pagination?.hasMore ?? result.data.length >= DELTA_PAGE_LIMIT;
  const tombstonesTruncated = result.meta?.deletedConversationIdsTruncated !== false;
  return { ok: true, data: { rows: result.data, deletedIds, complete: !hasMore && !tombstonesTruncated } };
}

/** Le plus récent `updatedAt` SERVI dans le cache, retiré du lag — horloge du
 * serveur, jamais celle du navigateur. `undefined` ⇒ rien pour borner un delta. */
export function deltaWatermark(data: ConversationsInfiniteData): string | undefined {
  const latest = data.pages
    .flatMap((page) => page.conversations)
    .map((c) => Date.parse(String(c.updatedAt ?? '')))
    .filter((ms) => !Number.isNaN(ms))
    .reduce((max, ms) => Math.max(max, ms), Number.NEGATIVE_INFINITY);
  return Number.isFinite(latest) ? new Date(latest - DELTA_WATERMARK_LAG_MS).toISOString() : undefined;
}

/**
 * Le curseur d'une page — l'id de sa dernière ligne, qui borne `before` sur
 * son RANG côté serveur. Une ligne que le delta vient de servir a pu changer
 * de rang (remontée par un message) ou quitter la vue (refusée en
 * `INVALID_CURSOR`) : le curseur passe alors à la dernière ligne INCHANGÉE de
 * la page, dont le rang n'a pas bougé. `null` ⇒ aucune ligne sûre.
 */
function stableCursor(rows: readonly Conversation[], touched: ReadonlySet<string>): string | null {
  const stable = rows.filter((c) => !touched.has(c.id));
  return stable[stable.length - 1]?.id ?? null;
}

/**
 * `mergeConversationsDelta` — les pages du cache, chaque ligne servie par le
 * delta remplacée À SA PLACE, les arrivées en tête de la page 1, les sorties
 * retirées. La partition en pages est GARDÉE : la Lentille trie elle-même par
 * rang (`resolveLensSections`), seuls les curseurs comptent pour la suite.
 * `null` quand la fusion ne peut pas garantir des curseurs justes (page vidée,
 * aucune ligne inchangée pour porter le curseur) — la relecture complète
 * reprend alors la main.
 */
export function mergeConversationsDelta(
  data: ConversationsInfiniteData,
  delta: ConversationsDelta,
): ConversationsInfiniteData | null {
  const served = new Map(delta.rows.map((c) => [c.id, c] as const));
  const deleted = new Set(delta.deletedIds);
  const touched = new Set([...served.keys(), ...deleted]);
  const known = new Set(data.pages.flatMap((page) => page.conversations.map((c) => c.id)));
  const arrivals = delta.rows.filter((c) => !known.has(c.id) && !deleted.has(c.id));

  const merged = data.pages.map((page) => {
    const rows = page.conversations.filter((c) => !deleted.has(c.id)).map((c) => served.get(c.id) ?? c);
    const { nextCursor } = page.cursorPagination;
    const cursor = nextCursor === null || !touched.has(nextCursor) ? nextCursor : stableCursor(rows, touched);
    return { page, rows, cursor };
  });

  const unsafe = merged.some(({ page, rows, cursor }) => rows.length === 0 || (page.cursorPagination.nextCursor !== null && cursor === null));
  if (unsafe) return null;

  const pages: ConversationsPage[] = merged.map(({ page, rows, cursor }, index) => ({
    ...page,
    conversations: index === 0 ? [...arrivals, ...rows] : rows,
    cursorPagination: { ...page.cursorPagination, nextCursor: cursor },
  }));
  const pageParams: ConversationsPageParam[] = pages.map((_, index) =>
    index === 0 ? undefined : (pages[index - 1]?.cursorPagination.nextCursor ?? undefined),
  );
  return { pages, pageParams };
}
