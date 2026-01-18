/**
 * Utils Index
 * Point d'entrée centralisé pour les utilitaires Socket.IO
 */

export {
  extractJWTToken,
  extractSessionToken,
  getConnectedUser,
  normalizeConversationId,
  buildAnonymousDisplayName,
  isValidConversationId,
  isValidMessageContent,
  getConversationRoomId,
  extractConversationIdFromRoom,
  type SocketUser,
  type ConnectedUserResult
} from './socket-helpers';
