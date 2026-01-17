/**
 * Conversation Hooks - Barrel Export
 *
 * Hooks spécialisés pour la gestion des conversations
 * Extraits de ConversationLayout pour suivre le principe Single Responsibility
 *
 * @module hooks/conversations
 */

// Hooks de sélection et navigation
export { useConversationSelection } from './useConversationSelection';

// Hooks UI
export { useConversationUI } from './useConversationUI';

// Hooks de communication
export { useConversationTyping } from './useConversationTyping';
export { useSocketCallbacks } from './use-socket-callbacks';

// Hooks de données
export { useComposerDrafts } from './useComposerDrafts';
export { useMessageActions } from './useMessageActions';
export { useParticipants } from './use-participants';

// Hooks de traduction
export { useTranslationState } from './use-translation-state';

// Hooks d'appel
export { useVideoCall } from './use-video-call';
