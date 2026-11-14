/**
 * Socket.IO Helper Utilities
 * Fonctions utilitaires réutilisables pour les handlers Socket.IO
 *
 * Unified Participant model: Every connected socket maps to a participantId.
 * For registered users the participantId is resolved per conversation.
 * For anonymous users the participantId IS their identity (looked up by sessionTokenHash).
 */

import type { Socket } from 'socket.io';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { BoundedTtlCache } from '../../utils/bounded-cache.js';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';

const logger = enhancedLogger.child({ module: 'SocketHelpers' });

/**
 * Represents a connected socket's identity.
 *
 * - Registered users: `userId` is set, `participantId` is null at connection time
 *   and resolved per-conversation when needed.
 * - Anonymous users: `participantId` is set at connection time (from Participant table),
 *   `userId` is null.
 */
export interface SocketUser {
  id: string;
  socketId: string;
  isAnonymous: boolean;
  language: string;
  /**
   * Ordered list of languages this socket can consume, derived from
   * resolveUserLanguagesOrdered() at connection time.
   * Priority: systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale.
   * Empty for anonymous users (they use `language` only).
   */
  resolvedLanguages: string[];
  /** For anonymous participants: the participant.id */
  participantId?: string;
  /** For registered users: the user.id */
  userId?: string;
  /** Display name resolved at connection time */
  displayName?: string;
  /** @deprecated kept for backward compat during migration — raw session token */
  sessionToken?: string;
  /**
   * #16687 — les conversations dont la room n'a PAS pu être rejointe pour cette
   * socket, après épuisement des réessais (`_joinConversationRoomsWithRetry`).
   *
   * Inscrire la socket dans `connectedUsers` n'est pas neutre : c'est ce que
   * `enqueueForOfflineParticipants` lit pour décider de ne PAS enfiler. Sans ce
   * marqueur, une socket absente de la room était tenue pour joignable et le
   * message n'allait nulle part — ni émission vive, ni rejeu.
   *
   * ABSENT ou vide = joignable partout, le cas nominal.
   *
   * **CE CHAMP EST DÉRIVÉ, il ne s'écrit plus à la main (#16726).** La
   * joignabilité est un fait de SOCKET, et cette entrée est par COMPTE : elle
   * porte l'INTERSECTION des verdicts des sockets vivantes du compte, que
   * `withCombinedReachability` (`socketio/socketReachability.ts`) recalcule à
   * chaque authentification, à chaque déconnexion et à chaque jonction de
   * mi-session. Le fait par socket vit dans `socket.data`.
   *
   * L'intersection, parce qu'un compte est joignable dès qu'UNE de ses sockets
   * est dans la room : l'union enfilerait pour un compte que la diffusion
   * atteint (doublon à la remise), et le dernier écrit PERDRAIT — c'est ce que
   * #16726 a coûté, le survivant malade héritant d'une entrée sans marqueur.
   *
   * **CE QUE CE MARQUEUR NE COUVRE PAS**, énuméré parce qu'un invariant annoncé
   * plus fort qu'il n'est vaut moins que pas d'invariant :
   *
   * - **Zéro room jointe** quand la LECTURE des participants tombe au
   *   handshake : un `ReadonlySet` d'ids ne peut pas dire « toutes, dont
   *   j'ignore la liste ». C'est `allConversationRoomsUnreachable`, déclaré
   *   juste en dessous, qui le dit (#16687 suite, #16719).
   * - **La portée reste celle du NŒUD.** `connectedUsers` est une carte de
   *   processus : un compte connecté à un autre nœud n'y a pas d'entrée, donc
   *   pas de marqueur — la file l'enfile comme hors ligne, ce qui est le repli
   *   juste. La JONCTION, elle, traverse désormais l'adaptateur (#18381).
   * - La convergence de l'appareil resté muet est une question distincte
   *   (#16688).
   */
  unreachableConversations?: ReadonlySet<string>;
  /**
   * « Cette socket n'est joignable pour AUCUNE de ses conversations, et on ne
   * sait pas lesquelles » (#16687 suite). Posé quand la LECTURE des
   * conversations du compte est tombée au handshake : zéro room rejointe, et
   * aucune liste à mettre dans `unreachableConversations`, qu'un ensemble ne
   * peut pas exprimer. La file hors ligne le lit comme injoignable quelle que
   * soit la conversation — sans quoi la socket passait pour joignable et rien
   * n'était enfilé, pendant qu'aucune diffusion de room ne l'atteignait.
   */
  allConversationRoomsUnreachable?: boolean;
}

export interface ConnectedUserResult {
  user: SocketUser;
  realUserId: string;
}

/**
 * Extrait le token JWT du socket (depuis handshake ou auth)
 */
export function extractJWTToken(socket: Socket): string | undefined {
  const authHeader = socket.handshake.auth?.token || socket.handshake.auth?.authToken || socket.handshake.headers?.authorization;
  if (!authHeader) return undefined;

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return typeof authHeader === 'string' ? authHeader : undefined;
}

/**
 * Extrait le sessionToken du socket (pour utilisateurs anonymes)
 */
export function extractSessionToken(socket: Socket): string | undefined {
  const sessionHeader = socket.handshake.auth?.sessionToken || socket.handshake.headers?.['x-session-token'];
  return typeof sessionHeader === 'string' ? sessionHeader : undefined;
}

/**
 * Récupère un utilisateur connecté depuis les maps
 */
export function getConnectedUser(
  userIdOrToken: string,
  connectedUsers: Map<string, SocketUser>
): ConnectedUserResult | null {
  const user = connectedUsers.get(userIdOrToken);
  if (!user) return null;

  return { user, realUserId: user.id };
}

// Cache immutable identifier → ObjectId (populated on first lookup). Bounded
// to CONVERSATION_ID_CACHE_MAX entries (FIFO eviction) — this is the hottest
// call site (every message send, typing event, reaction and join/leave), so
// an unbounded map would grow for the life of the gateway process across
// every distinct conversation identifier ever seen. Mirrors the bound
// already applied to MeeshySocketIOManager's private duplicate of this cache.
export const CONVERSATION_ID_CACHE_MAX = 2000;
const conversationIdCache = new BoundedTtlCache<string, string>({ maxSize: CONVERSATION_ID_CACHE_MAX });

/**
 * Normalise un identifiant de conversation (ObjectId ou identifier)
 */
export async function normalizeConversationId(
  conversationId: string,
  prismaFindUnique: (where: { identifier: string }) => Promise<{ id: string; identifier: string } | null>
): Promise<string> {
  try {
    if (isValidObjectId(conversationId)) return conversationId;
    const cached = conversationIdCache.get(conversationId);
    if (cached) return cached;
    const conversation = await prismaFindUnique({ identifier: conversationId });
    if (conversation) {
      conversationIdCache.set(conversationId, conversation.id);
      return conversation.id;
    }
    return conversationId;
  } catch (error) {
    logger.error('Erreur normalisation', error as Error);
    return conversationId;
  }
}

/**
 * Construit le nom d'affichage pour un participant
 */
export function buildParticipantDisplayName(
  participant: { displayName: string; nickname?: string | null } | null
): string {
  if (!participant) return 'Anonymous User';
  return participant.nickname || participant.displayName || 'Anonymous User';
}

/**
 * @deprecated Use buildParticipantDisplayName instead
 */
export function buildAnonymousDisplayName(
  anonymousUser: { username: string | null; firstName: string | null; lastName: string | null } | null
): string {
  if (!anonymousUser) return 'Anonymous User';

  const fullName = `${anonymousUser.firstName || ''} ${anonymousUser.lastName || ''}`.trim();
  return fullName || anonymousUser.username || 'Anonymous User';
}

/**
 * Type guards pour la validation des événements
 */
export function isValidConversationId(conversationId: unknown): conversationId is string {
  return typeof conversationId === 'string' && conversationId.length > 0;
}

export function isValidMessageContent(content: unknown): content is string {
  return typeof content === 'string';
}

/**
 * Crée une room ID pour une conversation
 */
export function getConversationRoomId(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/**
 * Extrait l'ID de conversation depuis une room ID
 */
export function extractConversationIdFromRoom(roomId: string): string | null {
  const match = roomId.match(/^conversation:(.+)$/);
  return match ? match[1] : null;
}
