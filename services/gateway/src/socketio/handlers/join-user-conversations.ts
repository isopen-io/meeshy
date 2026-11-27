import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'JoinUserConversations' });

/**
 * Réessais de jonction de room, en plus de la première tentative.
 *
 * Extrait d'`AuthHandler` par #16687 suite : ce fichier était à 999 lignes,
 * soit le seuil au-delà duquel un découpage se justifie sans se discuter, et
 * le dépôt interdit d'ajouter à un fichier déjà hors budget — on extrait
 * d'abord, on ajoute ensuite.
 */
const JOIN_RETRY_ATTEMPTS = 2;

const IDENTITY_ROOM_MISSING = 'identityRoomMissing';

/**
 * Vrai quand CETTE socket a épuisé ses réessais sur sa room d'identité (#16796).
 * Toute porte qui ferait entrer une socket dans une room de conversation le lit
 * d'abord : `conversation:join`, l'admission de mi-session, l'authentification.
 */
export function lacksIdentityRoom(socket: Pick<Socket, 'data'>): boolean {
  const bag = socket.data as Record<string, unknown> | undefined;
  return bag?.[IDENTITY_ROOM_MISSING] === true;
}

function noteIdentityRoom(socket: Socket, missing: boolean): void {
  const bag = (socket.data ?? {}) as Record<string, unknown>;
  bag[IDENTITY_ROOM_MISSING] = missing;
  socket.data = bag;
}

export async function joinConversationRoomsWithRetry(socket: Socket, conversationIds: string[]): Promise<string[]> {
  if (lacksIdentityRoom(socket)) return [...conversationIds];
  const maxAttempts = 1 + JOIN_RETRY_ATTEMPTS;
  let pending = conversationIds;
  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt++) {
    const results = await Promise.allSettled(pending.map(id => socket.join(ROOMS.conversation(id))));
    pending = pending.filter((_, i) => results[i].status === 'rejected');
  }
  return pending;
}

/**
 * La room d'identité `ROOMS.user(id)`, avec le même réessai borné (#16796).
 *
 * C'est par elle que les signaux de salon excluent un pair bloqué (#16800) :
 * une socket assise dans une room de conversation sans sa room d'identité est
 * INEXCLUABLE. L'appelant ne rejoint donc ses conversations que si cette
 * jonction a réussi — `false` ⇒ fail-closed, aucune room de conversation.
 */
export async function joinIdentityRoomWithRetry(socket: Socket, identityId: string): Promise<boolean> {
  const maxAttempts = 1 + JOIN_RETRY_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const [result] = await Promise.allSettled([socket.join(ROOMS.user(identityId))]);
    if (result.status === 'fulfilled') {
      noteIdentityRoom(socket, false);
      return true;
    }
  }
  noteIdentityRoom(socket, true);
  logger.error('identity room join failed after retries — socket joins no conversation room (cannot be excluded)', { identityId });
  return false;
}

/**
 * Les rooms de conversation de ce compte, et ce que la jonction en a fait.
 *
 * Rend la liste des rooms DÉFINITIVEMENT échouées — souvent vide — ou
 * `undefined` quand la LECTURE elle-même est tombée (#16687 suite).
 *
 * **`[]` et `undefined` ne disent pas la même chose, et c'est tout l'objet de
 * cette signature.** `[]` AFFIRME « aucune room n'a échoué » ; `undefined`
 * avoue « je n'ai rejoint aucune room, et je ne sais même pas lesquelles ».
 * Le `catch` rendait `[]` — donc la socket entrait dans `connectedUsers` sans
 * marqueur, dans zéro room de conversation, et la file hors ligne la tenait
 * pour joignable : rien n'était enfilé pendant que
 * `io.to(ROOMS.conversation(...))` n'atteignait personne. Pour toute la vie
 * de cette socket, et sans recours — ce qui n'est pas enfilé n'existe nulle
 * part, donc la reconnexion suivante n'a rien à rejouer. C'est exactement le
 * danger que le journal d'escalade ci-dessous décrit, et que
 * `unreachableConversations` a été créé pour fermer.
 *
 * La jumelle `participant-superset.ts` porte la même leçon, mot pour mot :
 * elle rend `undefined`, jamais `[]`, quand elle tombe.
 *
 * Le seul `throw` que ce `try` puisse attraper est celui de la lecture :
 * `_joinConversationRoomsWithRetry` s'appuie sur `Promise.allSettled`, qui ne
 * rejette pas.
 */
export async function joinUserConversations(
prisma: Pick<PrismaClient, 'participant'>,
socket: Socket,
userId: string,
isAnonymous: boolean,
): Promise<string[] | undefined> {
  try {
    let conversations: { conversationId: string }[] = [];

    if (isAnonymous) {
      conversations = await prisma.participant.findMany({
        where: { id: userId, ...PARTICIPATION_VIVANTE },
        select: { conversationId: true }
      });
    } else {
      // #7389 — un inscrit banni dont la ligne a été rallumée (bannie
      // pendant une suppression pour soi, puis restaurée par
      // `restore-for-me` avant #10436) ne rejoint pas la room : il y
      // recevrait chaque `message:new` que les portes REST lui refusent.
      conversations = await prisma.participant.findMany({
        where: { userId: userId, ...PARTICIPATION_VIVANTE },
        select: { conversationId: true }
      });
    }

    const conversationIds = conversations.map(conv => conv.conversationId);
    const stillFailed = await joinConversationRoomsWithRetry(socket, conversationIds);
    if (stillFailed.length > 0) {
      // Escalated to error: after retries, these room joins are genuinely
      // broken. Because delivery gates the offline queue purely on
      // `connectedUsers.has(userId)`, this recipient now looks online but is
      // absent from these rooms — a message sent to them lands nowhere (no
      // live emit, no offline enqueue) until a later reconnect re-joins them.
      logger.error('conversation room joins failed after retries — recipient may miss live messages until reconnect', {
        userId,
        failed: stillFailed.length,
        total: conversationIds.length,
        conversationIds: stillFailed,
      });
    }
    logger.debug('user joined conversation rooms', { userId, count: conversationIds.length - stillFailed.length });
    return stillFailed;
  } catch (error) {
    // Jamais `[]` : voir le doc-comment. On n'a rejoint aucune room et on ne
    // sait pas lesquelles — l'appelant doit pouvoir le dire à la file.
    logger.error('error joining conversations for user — socket is unreachable for ALL its conversations', { userId, error });
    return undefined;
  }
}
