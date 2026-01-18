/**
 * Socket.IO Helper Utilities
 * Fonctions utilitaires réutilisables pour les handlers Socket.IO
 */

import type { Socket } from 'socket.io';

export interface SocketUser {
  id: string;
  socketId: string;
  isAnonymous: boolean;
  language: string;
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
  const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
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

  // Si l'utilisateur est anonyme, le realUserId est le sessionToken
  const realUserId = user.isAnonymous && user.sessionToken ? user.sessionToken : userIdOrToken;

  return { user, realUserId };
}

/**
 * Normalise un identifiant de conversation (ObjectId ou identifier)
 */
export async function normalizeConversationId(
  conversationId: string,
  prismaFindUnique: (where: { identifier: string }) => Promise<{ id: string; identifier: string } | null>
): Promise<string> {
  try {
    // Si c'est un ObjectId MongoDB (24 caractères hex)
    if (/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return conversationId;
    }

    // C'est un identifier, chercher l'ObjectId correspondant
    const conversation = await prismaFindUnique({ identifier: conversationId });

    if (conversation) {
      return conversation.id;
    }

    return conversationId;
  } catch (error) {
    console.error('❌ [NORMALIZE] Erreur normalisation:', error);
    return conversationId;
  }
}

/**
 * Construit le nom d'affichage pour un utilisateur anonyme
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
