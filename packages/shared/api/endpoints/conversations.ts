/**
 * Les adresses du groupe `conversations` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/conversations/:conversationId/active-call */
export const byConversationIdActiveCall = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/active-call`;

/** GET /api/v1/conversations/:conversationId/attachments */
export const byConversationIdAttachments = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/attachments`;

/** POST /api/v1/conversations/:conversationId/clear-history */
export const byConversationIdClearHistory = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/clear-history`;

/** POST /api/v1/conversations/:conversationId/encryption */
export const byConversationIdEncryption = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/encryption`;

/** GET /api/v1/conversations/:conversationId/encryption-status */
export const byConversationIdEncryptionStatus = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/encryption-status`;

/** GET /api/v1/conversations/:conversationId/links */
export const byConversationIdLinks = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/links`;

/** POST /api/v1/conversations/:conversationId/mark-as-read */
export const byConversationIdMarkAsRead = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/mark-as-read`;

/** POST /api/v1/conversations/:conversationId/mark-as-received */
export const byConversationIdMarkAsReceived = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/mark-as-received`;

/** POST /api/v1/conversations/:conversationId/messages/:messageId/delivery-receipt */
export const byConversationIdMessagesByMessageIdDeliveryReceipt = (conversationId: string, messageId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/delivery-receipt`;

/** GET /api/v1/conversations/:conversationId/read-statuses */
export const byConversationIdReadStatuses = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/read-statuses`;

/** GET · POST /api/v1/conversations/:conversationId/receipts */
export const byConversationIdReceipts = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/receipts`;

/** POST /api/v1/conversations/:conversationId/restore-for-me */
export const byConversationIdRestoreForMe = (conversationId: string): string => `/api/v1/conversations/${encodeURIComponent(conversationId)}/restore-for-me`;

/** GET · PUT · PATCH · DELETE /api/v1/conversations/:id */
export const byId = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}`;

/** GET /api/v1/conversations/:id/analysis */
export const byIdAnalysis = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/analysis`;

/** GET /api/v1/conversations/:id/card */
export const byIdCard = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/card`;

/** DELETE /api/v1/conversations/:id/delete-for-me */
export const byIdDeleteForMe = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/delete-for-me`;

/** GET /api/v1/conversations/:id/engagement */
export const byIdEngagement = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/engagement`;

/** POST /api/v1/conversations/:id/invite */
export const byIdInvite = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/invite`;

/** POST /api/v1/conversations/:id/leave */
export const byIdLeave = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/leave`;

/** POST /api/v1/conversations/:id/mark-read */
export const byIdMarkRead = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/mark-read`;

/** POST /api/v1/conversations/:id/mark-unread */
export const byIdMarkUnread = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/mark-unread`;

/** GET · POST /api/v1/conversations/:id/messages */
export const byIdMessages = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/messages`;

/** POST /api/v1/conversations/:id/messages/after-read/consume */
export const byIdMessagesAfterReadConsume = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/messages/after-read/consume`;

/** PUT · DELETE /api/v1/conversations/:id/messages/:messageId */
export const byIdMessagesByMessageId = (id: string, messageId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`;

/** POST /api/v1/conversations/:id/messages/:messageId/consume */
export const byIdMessagesByMessageIdConsume = (id: string, messageId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/consume`;

/** PUT · DELETE /api/v1/conversations/:id/messages/:messageId/pin */
export const byIdMessagesByMessageIdPin = (id: string, messageId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/pin`;

/** GET /api/v1/conversations/:id/messages/search */
export const byIdMessagesSearch = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/messages/search`;

/** POST /api/v1/conversations/:id/new-link */
export const byIdNewLink = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/new-link`;

/** GET · POST /api/v1/conversations/:id/participants */
export const byIdParticipants = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/participants`;

/** GET /api/v1/conversations/:id/participants/:participantId/profile */
export const byIdParticipantsByParticipantIdProfile = (id: string, participantId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}/profile`;

/** PATCH /api/v1/conversations/:id/participants/:participantId/rights */
export const byIdParticipantsByParticipantIdRights = (id: string, participantId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}/rights`;

/** PATCH /api/v1/conversations/:id/participants/:participantKey */
export const byIdParticipantsByParticipantKey = (id: string, participantKey: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantKey)}`;

/** DELETE /api/v1/conversations/:id/participants/:userId */
export const byIdParticipantsByUserId = (id: string, userId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(userId)}`;

/** PATCH /api/v1/conversations/:id/participants/:userId/ban */
export const byIdParticipantsByUserIdBan = (id: string, userId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(userId)}/ban`;

/** PATCH /api/v1/conversations/:id/participants/:userId/role */
export const byIdParticipantsByUserIdRole = (id: string, userId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(userId)}/role`;

/** PATCH /api/v1/conversations/:id/participants/:userId/unban */
export const byIdParticipantsByUserIdUnban = (id: string, userId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(userId)}/unban`;

/** GET /api/v1/conversations/:id/pinned-messages */
export const byIdPinnedMessages = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/pinned-messages`;

/** GET /api/v1/conversations/:id/reactions */
export const byIdReactions = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/reactions`;

/** GET /api/v1/conversations/:id/stats */
export const byIdStats = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/stats`;

/** GET /api/v1/conversations/:id/status */
export const byIdStatus = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/status`;

/** GET /api/v1/conversations/:id/threads/:messageId */
export const byIdThreadsByMessageId = (id: string, messageId: string): string => `/api/v1/conversations/${encodeURIComponent(id)}/threads/${encodeURIComponent(messageId)}`;

/** GET /api/v1/conversations/check-identifier/:identifier */
export const checkIdentifierByIdentifier = (identifier: string): string => `/api/v1/conversations/check-identifier/${encodeURIComponent(identifier)}`;

/** POST /api/v1/conversations/join/:linkId */
export const joinByLinkId = (linkId: string): string => `/api/v1/conversations/join/${encodeURIComponent(linkId)}`;

/** GET · POST /api/v1/conversations */
export const root = '/api/v1/conversations';

/** GET /api/v1/conversations/search */
export const search = '/api/v1/conversations/search';
