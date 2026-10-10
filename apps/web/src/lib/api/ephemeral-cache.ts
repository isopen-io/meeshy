import type { DehydratedState } from '@tanstack/react-query';

import { isEphemeralGone } from '@/lib/view/ephemeral-gone';

import type { MessagesInfiniteData } from './messages-pages';
import type { Message } from './types';

/**
 * **LE DISQUE NE GARDE PAS UN ÉPHÉMÈRE PARTI** (#8900) — le cache de requêtes
 * est persisté dans `localStorage` (`query-client.ts`) et restauré au
 * rechargement. Sans ce passage, un message échu y dormait EN CLAIR, et
 * revenait au rechargement suivant — hors ligne compris, où aucune relecture
 * du fil ne le chasse. La passerelle le ressert encore une heure
 * (`isEphemeralServableToReader`, la grâce de la directive #7451) : c'est au
 * client de le taire, et il le fait par la MÊME loi que le fil
 * (`isEphemeralGone`), à l'écriture comme à la relecture.
 *
 * `isMine: false` sans perte : l'expéditeur n'a jamais de réception locale
 * (`resolveEphemeralDeadline` ne la pose que chez un destinataire), et sans
 * elle la règle ne lit que l'échéance SERVIE — exactement sa lecture pour
 * l'expéditeur.
 */

const isThreadKey = (key: readonly unknown[]): boolean =>
  key.length === 3 && key[0] === 'conversations' && key[2] === 'messages';

const isPagesData = (data: unknown): data is MessagesInfiniteData =>
  typeof data === 'object' && data !== null && Array.isArray((data as { pages?: unknown }).pages);

function prunePages(data: MessagesInfiniteData, now: number): MessagesInfiniteData {
  const gone = (message: Message): boolean => isEphemeralGone({ message, isMine: false, now });
  if (!data.pages.some((page) => Array.isArray(page.messages) && page.messages.some(gone))) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      Array.isArray(page.messages) ? { ...page, messages: page.messages.filter((message) => !gone(message)) } : page,
    ),
  };
}

export function pruneGoneEphemerals(state: DehydratedState, now: number): DehydratedState {
  return {
    ...state,
    queries: state.queries.map((query) =>
      isThreadKey(query.queryKey) && isPagesData(query.state.data)
        ? { ...query, state: { ...query.state, data: prunePages(query.state.data, now) } }
        : query,
    ),
  };
}
