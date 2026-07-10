/**
 * Index des utilitaires partagés Meeshy
 * Exporte tous les helpers et utilitaires réutilisables
 */

export * from './languages.js';
export * from './errors.js';
export * from './validation.js';
export * from './conversation-helpers.js';
export * from './attachment-validators.js';
export * from './language-normalize.js';
export * from './notification-strings.js';
export { getSenderUserId } from './sender-identity.js';
export {
  generateClientMessageId,
  isValidClientMessageId,
  CLIENT_MESSAGE_ID_REGEX,
} from './client-message-id.js';
