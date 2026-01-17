/**
 * Socket.IO Services
 * Refactored modular architecture
 *
 * Single Responsibility: Each service handles one domain
 * - ConnectionService: Connection lifecycle
 * - MessagingService: Message operations
 * - TypingService: Typing indicators
 * - PresenceService: User presence & stats
 * - TranslationService: Message translations
 * - SocketIOOrchestrator: Coordinates all services
 */

export * from './types';
export { ConnectionService } from './connection.service';
export { MessagingService } from './messaging.service';
export { TypingService } from './typing.service';
export { PresenceService } from './presence.service';
export { TranslationService } from './translation.service';
export { SocketIOOrchestrator } from './orchestrator.service';

// Convenience exports for common usage
export const getSocketIOOrchestrator = () => {
  const { SocketIOOrchestrator } = require('./orchestrator.service');
  return SocketIOOrchestrator.getInstance();
};
