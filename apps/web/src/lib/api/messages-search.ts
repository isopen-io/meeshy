import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import { withSenderAccount } from './sender-account';
import type { Message } from './types';
import { sealedIfOpened } from './view-once-seal';

/**
 * LE PORT DE LA RECHERCHE DANS UNE CONVERSATION — `GET
 * conversations.byIdMessagesSearch(id)?q=<≥2>&limit=20[&cursor=<id>]`
 * (`services/gateway/src/routes/conversations/messages-search.ts`), miroir de
 * `MessageService.search` / `searchWithCursor` iOS
 * (`ConversationSearchHandler.swift`).
 *
 * **POURQUOI CETTE ROUTE ET PAS `/conversations/search`.** La seconde cherche
 * des CONVERSATIONS (titre, nom des membres) pour la liste ; c'est la
 * première qui cherche des MESSAGES dans un fil, par leur contenu ET leurs
 * traductions — et c'est elle qui porte déjà toutes les lois du lecteur : le
 * masquage personnel (`clear-history`, `delete-for-me`), le plancher
 * d'historique, la loi de sortie des messages protégés (`appearsInSearch`),
 * l'éphémère échu. Le client ne refiltre rien : il PEINT ce qu'on lui sert.
 *
 * **LA PAGINATION EST UN CURSEUR D'IDENTIFIANT** — `nextCursor` est l'id du
 * plus ancien résultat servi, à renvoyer tel quel ; la passerelle le borne à
 * CETTE conversation (#4177). La réponse porte `cursorPagination` à la RACINE
 * (pas sous `meta`) : c'est ce que le transport remonte déjà pour la page de
 * messages, et ce que la note de la route promet de ne pas casser.
 *
 * `q` sous deux caractères rend 400 (`minLength: 2`) — l'appelant
 * (`useThreadSearch`) ne l'interroge pas sous ce seuil ; ce port envoie la
 * requête ROGNÉE, jamais les espaces qui la gonfleraient au-dessus du seuil.
 *
 * Chaque résultat passe par les deux mêmes projections que la page du fil
 * (`requestMessageRows`) : l'expéditeur rattaché à son compte, et la vue
 * unique déjà ouverte par moi PURGÉE — un résultat de recherche ne doit pas
 * redonner à lire ce que le fil a scellé.
 */
export type MessageSearchPage = {
  readonly results: readonly Message[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

/** La taille de page — celle d'iOS (`limit: 20`) et le défaut de la route. */
export const MESSAGE_SEARCH_LIMIT = 20;

/**
 * La loi de la passerelle pour la source `fixtures` : contenu OU traduction
 * contenant la requête, insensible à la casse, du plus récent au plus ancien,
 * une page de `MESSAGE_SEARCH_LIMIT` après le curseur.
 */
export function searchMessagesIn(corpus: readonly Message[], query: string, cursor: string | null): MessageSearchPage {
  const needle = query.trim().toLocaleLowerCase();
  const matches = [...corpus]
    .filter(
      (message) =>
        message.deletedAt === undefined &&
        (message.content.toLocaleLowerCase().includes(needle) ||
          (message.translations ?? []).some((t) => t.translatedContent.toLocaleLowerCase().includes(needle))),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const start = cursor === null ? 0 : matches.findIndex((m) => m.id === cursor) + 1;
  const page = matches.slice(start, start + MESSAGE_SEARCH_LIMIT);
  const hasMore = matches.length > start + MESSAGE_SEARCH_LIMIT;
  return { results: page, hasMore, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

export async function searchConversationMessages(
  params: ConversationsDeps & {
    readonly conversationId: string;
    readonly query: string;
    readonly cursor?: string | null;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<MessageSearchPage>> {
  const query = params.query.trim();
  const cursor = params.cursor ?? null;
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { messagesOf } = await import('./fixtures');
    return { ok: true, data: searchMessagesIn(messagesOf(params.conversationId), query, cursor) };
  }
  const search = new URLSearchParams({ q: query, limit: String(MESSAGE_SEARCH_LIMIT) });
  if (cursor !== null) search.set('cursor', cursor);
  const result = await params.transport.request<readonly Message[]>({
    method: 'GET',
    path: `${conversationsEndpoints.byIdMessagesSearch(params.conversationId)}?${search.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    ok: true,
    data: {
      results: rows.map((message) => sealedIfOpened(withSenderAccount(message))),
      hasMore: result.cursorPagination?.hasMore === true,
      nextCursor: result.cursorPagination?.nextCursor ?? null,
    },
  };
}
