import type { QueryClient } from '@tanstack/react-query';

import { messagesQueryKey } from '@/lib/api/messages';
import type { MessagesInfiniteData } from '@/lib/api/messages-pages';
import type { Message } from '@/lib/api/types';

/**
 * LA FORME `InfiniteData` DU CACHE DU FIL (#6972), ÉCRITE UNE FOIS POUR TOUS
 * LES TÉMOINS QUI LA SÈMENT.
 *
 * `threadPages` la POSE, `threadOf` la RELIT APLATIE. Ce sont les deux seuls
 * endroits qui la connaissent : les témoins mesurent la RÈGLE (dédoublonnage,
 * fusion de traductions, portée, enrichissement d'une pièce), jamais la
 * structure de cache qui la porte.
 *
 * EXTRAIT DE `realtime-apply.test.ts` AU LOT #7017, et pour la raison que la
 * règle de budget nomme : ce fichier de témoins passait 1 000 lignes, et le
 * découpage qui se justifie alors est celui PAR RESPONSABILITÉ. Deux copies de
 * ces quatre fabriques — une par fichier de témoins — auraient été deux
 * occasions de faire dériver la forme du cache le jour où elle change ; c'est
 * exactement ce que #6972 venait de retirer du code de production, et le
 * recréer du côté des témoins n'aurait rien valu de mieux.
 */
export const threadPages = (messages: readonly Message[]): MessagesInfiniteData =>
  ({ pages: [{ messages, hasOlder: false, nextCursor: null }], pageParams: [undefined] }) as MessagesInfiniteData;

export const threadOf = (
  client: QueryClient,
  conversationId: string,
): { readonly messages: readonly Message[] } | undefined => {
  const data = client.getQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId));
  return data === undefined ? undefined : { messages: data.pages.flatMap((p) => [...p.messages]) };
};

/**
 * UN MESSAGE DU FIL, aux défauts NON NULS — un témoin ne nomme que le champ
 * qu'il mesure, et les autres doivent quand même exister sous la forme que le
 * décodeur garantit.
 */
export const localMessage = (partial: Partial<Message> & { readonly clientMessageId?: string }): Message =>
  ({
    id: 'local-1',
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: 'en cours',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-12T09:00:00.000Z'),
    timestamp: new Date('2026-09-12T09:00:00.000Z'),
    ...partial,
  }) as Message;

/**
 * UNE fonction rendrait `queryFn` observable — un témoin qui interroge le
 * compteur d'appels PROUVE qu'aucune requête réseau n'a été déclenchée par
 * `setQueryData` (§ critère de l'issue #5793 : « sans requête réseau », repris
 * par #7017 : « la transcription arrive SANS rechargement »).
 */
export function countingQueryFn(calls: { count: number }) {
  return async () => {
    calls.count += 1;
    throw new Error('queryFn ne doit JAMAIS être appelée par un puits de temps réel');
  };
}
