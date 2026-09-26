import type { InfiniteData } from '@tanstack/react-query';

import { itemsOfKind, type MediaHubKind } from '@/lib/view/media-hub';

import { unwrap } from './client';
import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import { decodeMessage } from './decode';
import { nextMessagesCursor, pageOfMessages, type MessagesPage, type MessagesPageParam } from './messages-pages';
import type { Message } from './types';

/**
 * **LE PORT DE L'INDEX D'UNE CONVERSATION (#8103)** —
 * `GET /api/v1/conversations/:id/messages?view=media&kinds=<genre>&q=<terme>&before=<id>&limit=N`
 * (`services/gateway/src/routes/conversations/messages-list-views.ts`, genres :
 * `messages-media-kinds.ts`, #8095 puis #8098).
 *
 * La réponse a la forme du FIL (`data` + `cursorPagination`), et la page du
 * cache a donc la forme de `MessagesPage` : le garde-fou de pagination du fil
 * (`nextMessagesCursor`, ses cinq refus — dont celui d'un `before` inconnu que
 * la passerelle RESSERT au lieu de refuser) s'applique tel quel, sans jumelle.
 *
 * Deux différences avec le fil, voulues :
 *  - l'ordre reste celui SERVI (`createdAt DESC`) — une grille de médias se lit
 *    du plus récent au plus ancien, et l'extension vers le passé AJOUTE à la
 *    fin : l'index d'une tuile déjà ouverte en visionneuse ne bouge pas ;
 *  - UNE CLÉ PAR SEGMENT ET PAR RECHERCHE (`mediaHubQueryKey`) : revenir sur un
 *    segment déjà vu le peint depuis le cache, sans squelette (cache d'abord),
 *    pendant que TanStack le revalide en fond ; changer la recherche change de
 *    clé, et la requête précédente — qui n'a plus d'observateur — est annulée
 *    par son `signal` (TanStack v5 annule une requête abandonnée dont la
 *    fonction a lu le signal).
 */
export const MEDIA_HUB_PAGE_SIZE = 30;
export const MEDIA_HUB_STALE_TIME = 60_000;

/** Le plancher de la passerelle (`LONGUEUR_MINIMALE_RECHERCHE`) : en dessous, 400 `INVALID_VIEW`. */
const MIN_SEARCH_LENGTH = 2;

/** Un terme cherchable, ou `null` : un terme trop court sert le segment ENTIER, jamais un refus. */
export function mediaHubSearchTerm(raw: string): string | null {
  const term = raw.trim();
  return term.length >= MIN_SEARCH_LENGTH ? term : null;
}

/** Hors de `['conversations', …]` : ce préfixe porte des conversations et des fils, parcourus comme tels. */
export const mediaHubQueryKey = (conversationId: string, kind: MediaHubKind, term: string | null) =>
  ['conversation-media-hub', conversationId, kind, term ?? ''] as const;

export function mediaHubPath(params: {
  readonly conversationId: string;
  readonly kind: MediaHubKind;
  readonly term: string | null;
  readonly before: MessagesPageParam;
}): string {
  const query = new URLSearchParams({ view: 'media', kinds: params.kind, limit: String(MEDIA_HUB_PAGE_SIZE) });
  if (params.term !== null) query.set('q', params.term);
  if (params.before !== undefined) query.set('before', params.before);
  return `/api/v1/conversations/${encodeURIComponent(params.conversationId)}/messages?${query.toString()}`;
}

/** Le filtre des fixtures MIME celui de la passerelle : le genre, puis le terme dans le contenu ou un nom de pièce. */
function fixtureMatches(message: Message, kind: MediaHubKind, term: string | null): boolean {
  if (itemsOfKind([message], kind).length === 0) return false;
  if (term === null) return true;
  const needle = term.toLowerCase();
  const inContent = (message.content ?? '').toLowerCase().includes(needle);
  const inNames = (message.attachments ?? []).some((attachment) => attachment.originalName.toLowerCase().includes(needle));
  return inContent || inNames;
}

export async function loadMediaHubPage(
  params: ConversationsDeps & {
    readonly conversationId: string;
    readonly kind: MediaHubKind;
    readonly term: string | null;
    readonly before?: MessagesPageParam;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<MessagesPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { messagesOf } = await import('./fixtures');
    const corpus = messagesOf(params.conversationId).filter((message) => fixtureMatches(message, params.kind, params.term));
    const page = pageOfMessages(corpus, {
      ...(params.before === undefined ? {} : { before: params.before }),
      limit: MEDIA_HUB_PAGE_SIZE,
    });
    return { ok: true, data: { ...page, messages: [...page.messages].reverse() } };
  }
  const result = await params.transport.request<readonly Message[]>({
    method: 'GET',
    path: mediaHubPath({ conversationId: params.conversationId, kind: params.kind, term: params.term, before: params.before }),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      messages: Array.isArray(result.data) ? result.data : [],
      hasOlder: result.cursorPagination?.hasMore === true,
      nextCursor: result.cursorPagination?.nextCursor ?? null,
    },
  };
}

export type MediaHubData = InfiniteData<MessagesPage, MessagesPageParam>;

type PageContext = { readonly pageParam?: MessagesPageParam; readonly signal?: AbortSignal };

export function mediaHubInfiniteOptions(deps: ConversationsDeps, conversationId: string, kind: MediaHubKind, term: string | null) {
  return {
    queryKey: mediaHubQueryKey(conversationId, kind, term),
    staleTime: MEDIA_HUB_STALE_TIME,
    initialPageParam: undefined as MessagesPageParam,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(
        await loadMediaHubPage({
          ...deps,
          conversationId,
          kind,
          term,
          ...(pageParam === undefined ? {} : { before: pageParam }),
          ...(signal === undefined ? {} : { signal }),
        }),
      ),
    getNextPageParam: nextMessagesCursor,
  };
}

/**
 * Les messages de toutes les pages chargées, dans l'ordre SERVI (récent
 * d'abord), dédoublonnés à la couture, dates revécues (`decodeMessage`, le
 * cache tient des chaînes — D-26). Fonction de MODULE, pour le `select`.
 */
export function flattenMediaHubPages(data: MediaHubData): readonly Message[] {
  const seen = new Set<string>();
  return data.pages.flatMap((page) =>
    page.messages.flatMap((message) => {
      if (seen.has(message.id)) return [];
      seen.add(message.id);
      return [decodeMessage(message)];
    }),
  );
}
