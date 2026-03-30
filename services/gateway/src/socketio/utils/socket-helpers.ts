/**
 * Socket.IO Helper Utilities
 * Fonctions utilitaires réutilisables pour les handlers Socket.IO
 *
 * Unified Participant model: Every connected socket maps to a participantId.
 * For registered users the participantId is resolved per conversation.
 * For anonymous users the participantId IS their identity (looked up by sessionTokenHash).
 */

import type { Socket } from 'socket.io';

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
  /** For anonymous participants: the participant.id */
  participantId?: string;
  /** For registered users: the user.id */
  userId?: string;
  /** Display name resolved at connection time */
  displayName?: string;
  /** @deprecated kept for backward compat during migration — raw session token */
  sessionToken?: string;
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

const conversationIdCache = new Map<string, string>();

/**
 * Normalise un identifiant de conversation (ObjectId ou identifier)
 */
export async function normalizeConversationId(
  conversationId: string,
  prismaFindUnique: (where: { identifier: string }) => Promise<{ id: string; identifier: string } | null>
): Promise<string> {
  try {
    if (/^[0-9a-fA-F]{24}$/.test(conversationId)) return conversationId;
    const cached = conversationIdCache.get(conversationId);
    if (cached) return cached;
    const conversation = await prismaFindUnique({ identifier: conversationId });
    if (conversation) {
      conversationIdCache.set(conversationId, conversation.id);
      return conversation.id;
    }
    return conversationId;
  } catch (error) {
    console.error('❌ [NORMALIZE] Erreur normalisation:', error);
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
