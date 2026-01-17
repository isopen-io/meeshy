/**
 * Legacy compatibility layer for conversations service
 *
 * This file maintains backward compatibility with the original API.
 * All implementation has been moved to specialized services in ./conversations/
 *
 * @deprecated Import from './conversations' instead for new code
 */

export {
  conversationsService,
  ConversationsService,
} from './conversations';

export type {
  ParticipantsFilters,
  GetConversationsOptions,
  GetConversationsResponse,
  GetMessagesResponse,
  AllParticipantsResponse,
  CreateLinkData,
  MarkAsReadResponse,
} from './conversations/types';
