/**
 * Les adresses du groupe `admin` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/admin/agent/archetypes */
export const agentArchetypes = '/api/v1/admin/agent/archetypes';

/** GET /api/v1/admin/agent/configs */
export const agentConfigs = '/api/v1/admin/agent/configs';

/** GET · PUT · DELETE /api/v1/admin/agent/configs/:conversationId */
export const agentConfigsByConversationId = (conversationId: string): string => `/api/v1/admin/agent/configs/${encodeURIComponent(conversationId)}`;

/** GET /api/v1/admin/agent/configs/:conversationId/live */
export const agentConfigsByConversationIdLive = (conversationId: string): string => `/api/v1/admin/agent/configs/${encodeURIComponent(conversationId)}/live`;

/** GET /api/v1/admin/agent/configs/:conversationId/messages */
export const agentConfigsByConversationIdMessages = (conversationId: string): string => `/api/v1/admin/agent/configs/${encodeURIComponent(conversationId)}/messages`;

/** GET /api/v1/admin/agent/configs/:conversationId/roles */
export const agentConfigsByConversationIdRoles = (conversationId: string): string => `/api/v1/admin/agent/configs/${encodeURIComponent(conversationId)}/roles`;

/** GET /api/v1/admin/agent/configs/:conversationId/schedule */
export const agentConfigsByConversationIdSchedule = (conversationId: string): string => `/api/v1/admin/agent/configs/${encodeURIComponent(conversationId)}/schedule`;

/** POST /api/v1/admin/agent/configs/:conversationId/stop */
export const agentConfigsByConversationIdStop = (conversationId: string): string => `/api/v1/admin/agent/configs/${encodeURIComponent(conversationId)}/stop`;

/** GET /api/v1/admin/agent/configs/:conversationId/summary */
export const agentConfigsByConversationIdSummary = (conversationId: string): string => `/api/v1/admin/agent/configs/${encodeURIComponent(conversationId)}/summary`;

/** POST /api/v1/admin/agent/configs/:conversationId/trigger */
export const agentConfigsByConversationIdTrigger = (conversationId: string): string => `/api/v1/admin/agent/configs/${encodeURIComponent(conversationId)}/trigger`;

/** GET /api/v1/admin/agent/delivery-queue */
export const agentDeliveryQueue = '/api/v1/admin/agent/delivery-queue';

/** PATCH · DELETE /api/v1/admin/agent/delivery-queue/:id */
export const agentDeliveryQueueById = (id: string): string => `/api/v1/admin/agent/delivery-queue/${encodeURIComponent(id)}`;

/** GET · PUT /api/v1/admin/agent/global-config */
export const agentGlobalConfig = '/api/v1/admin/agent/global-config';

/** GET · PUT /api/v1/admin/agent/llm */
export const agentLlm = '/api/v1/admin/agent/llm';

/** GET /api/v1/admin/agent/recent-activity */
export const agentRecentActivity = '/api/v1/admin/agent/recent-activity';

/** DELETE /api/v1/admin/agent/reset */
export const agentReset = '/api/v1/admin/agent/reset';

/** DELETE /api/v1/admin/agent/reset/conversation/:conversationId */
export const agentResetConversationByConversationId = (conversationId: string): string => `/api/v1/admin/agent/reset/conversation/${encodeURIComponent(conversationId)}`;

/** DELETE /api/v1/admin/agent/reset/user/:userId */
export const agentResetUserByUserId = (userId: string): string => `/api/v1/admin/agent/reset/user/${encodeURIComponent(userId)}`;

/** POST /api/v1/admin/agent/roles/:conversationId/:userId/assign */
export const agentRolesByConversationIdByUserIdAssign = (conversationId: string, userId: string): string => `/api/v1/admin/agent/roles/${encodeURIComponent(conversationId)}/${encodeURIComponent(userId)}/assign`;

/** POST /api/v1/admin/agent/roles/:conversationId/:userId/unlock */
export const agentRolesByConversationIdByUserIdUnlock = (conversationId: string, userId: string): string => `/api/v1/admin/agent/roles/${encodeURIComponent(conversationId)}/${encodeURIComponent(userId)}/unlock`;

/** GET /api/v1/admin/agent/scan-logs */
export const agentScanLogs = '/api/v1/admin/agent/scan-logs';

/** GET /api/v1/admin/agent/scan-logs/:logId */
export const agentScanLogsByLogId = (logId: string): string => `/api/v1/admin/agent/scan-logs/${encodeURIComponent(logId)}`;

/** GET /api/v1/admin/agent/scan-logs/stats */
export const agentScanLogsStats = '/api/v1/admin/agent/scan-logs/stats';

/** GET /api/v1/admin/agent/stats */
export const agentStats = '/api/v1/admin/agent/stats';

/** GET · POST /api/v1/admin/agent/topics */
export const agentTopics = '/api/v1/admin/agent/topics';

/** GET · PATCH · DELETE /api/v1/admin/agent/topics/:id */
export const agentTopicsById = (id: string): string => `/api/v1/admin/agent/topics/${encodeURIComponent(id)}`;

/** POST /api/v1/admin/agent/topics/:id/test */
export const agentTopicsByIdTest = (id: string): string => `/api/v1/admin/agent/topics/${encodeURIComponent(id)}/test`;

/** GET /api/v1/admin/analytics/calls */
export const analyticsCalls = '/api/v1/admin/analytics/calls';

/** GET /api/v1/admin/analytics/hourly-activity */
export const analyticsHourlyActivity = '/api/v1/admin/analytics/hourly-activity';

/** GET /api/v1/admin/analytics/kpis */
export const analyticsKpis = '/api/v1/admin/analytics/kpis';

/** GET /api/v1/admin/analytics/language-distribution */
export const analyticsLanguageDistribution = '/api/v1/admin/analytics/language-distribution';

/** GET /api/v1/admin/analytics/message-types */
export const analyticsMessageTypes = '/api/v1/admin/analytics/message-types';

/** GET /api/v1/admin/analytics/realtime */
export const analyticsRealtime = '/api/v1/admin/analytics/realtime';

/** GET /api/v1/admin/analytics/user-distribution */
export const analyticsUserDistribution = '/api/v1/admin/analytics/user-distribution';

/** GET /api/v1/admin/analytics/volume-timeline */
export const analyticsVolumeTimeline = '/api/v1/admin/analytics/volume-timeline';

/** GET /api/v1/admin/anonymous-users */
export const anonymousUsers = '/api/v1/admin/anonymous-users';

/** GET /api/v1/admin/anonymous-users/:participantId */
export const anonymousUsersByParticipantId = (participantId: string): string => `/api/v1/admin/anonymous-users/${encodeURIComponent(participantId)}`;

/** GET /api/v1/admin/audit-logs */
export const auditLogs = '/api/v1/admin/audit-logs';

/** GET · POST /api/v1/admin/broadcasts */
export const broadcasts = '/api/v1/admin/broadcasts';

/** GET · PUT · DELETE /api/v1/admin/broadcasts/:id */
export const broadcastsById = (id: string): string => `/api/v1/admin/broadcasts/${encodeURIComponent(id)}`;

/** POST /api/v1/admin/broadcasts/:id/preview */
export const broadcastsByIdPreview = (id: string): string => `/api/v1/admin/broadcasts/${encodeURIComponent(id)}/preview`;

/** POST /api/v1/admin/broadcasts/:id/send */
export const broadcastsByIdSend = (id: string): string => `/api/v1/admin/broadcasts/${encodeURIComponent(id)}/send`;

/** POST /api/v1/admin/broadcasts/:id/send-inapp */
export const broadcastsByIdSendInapp = (id: string): string => `/api/v1/admin/broadcasts/${encodeURIComponent(id)}/send-inapp`;

/** GET /api/v1/admin/communities */
export const communities = '/api/v1/admin/communities';

/** GET · PATCH /api/v1/admin/communities/:communityId */
export const communitiesByCommunityId = (communityId: string): string => `/api/v1/admin/communities/${encodeURIComponent(communityId)}`;

/** GET /api/v1/admin/communities/:communityId/members */
export const communitiesByCommunityIdMembers = (communityId: string): string => `/api/v1/admin/communities/${encodeURIComponent(communityId)}/members`;

/** GET /api/v1/admin/conversations */
export const conversations = '/api/v1/admin/conversations';

/** GET · PATCH /api/v1/admin/conversations/:conversationId */
export const conversationsByConversationId = (conversationId: string): string => `/api/v1/admin/conversations/${encodeURIComponent(conversationId)}`;

/** GET /api/v1/admin/conversations/:conversationId/messages */
export const conversationsByConversationIdMessages = (conversationId: string): string => `/api/v1/admin/conversations/${encodeURIComponent(conversationId)}/messages`;

/** GET /api/v1/admin/conversations/:conversationId/participants */
export const conversationsByConversationIdParticipants = (conversationId: string): string => `/api/v1/admin/conversations/${encodeURIComponent(conversationId)}/participants`;

/** PATCH /api/v1/admin/conversations/:conversationId/participants/:userId */
export const conversationsByConversationIdParticipantsByUserId = (conversationId: string, userId: string): string => `/api/v1/admin/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}`;

/** POST /api/v1/admin/conversations/:conversationId/participants/:userId/remove */
export const conversationsByConversationIdParticipantsByUserIdRemove = (conversationId: string, userId: string): string => `/api/v1/admin/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}/remove`;

/** GET /api/v1/admin/dashboard */
export const dashboard = '/api/v1/admin/dashboard';

/** POST /api/v1/admin/dashboard/invalidate-cache */
export const dashboardInvalidateCache = '/api/v1/admin/dashboard/invalidate-cache';

/** GET /api/v1/admin/invitations */
export const invitations = '/api/v1/admin/invitations';

/** GET · PATCH /api/v1/admin/invitations/:id */
export const invitationsById = (id: string): string => `/api/v1/admin/invitations/${encodeURIComponent(id)}`;

/** GET /api/v1/admin/invitations/stats */
export const invitationsStats = '/api/v1/admin/invitations/stats';

/** GET /api/v1/admin/invitations/timeline/daily */
export const invitationsTimelineDaily = '/api/v1/admin/invitations/timeline/daily';

/** GET /api/v1/admin/languages/stats */
export const languagesStats = '/api/v1/admin/languages/stats';

/** GET /api/v1/admin/languages/timeline */
export const languagesTimeline = '/api/v1/admin/languages/timeline';

/** GET /api/v1/admin/languages/translation-accuracy */
export const languagesTranslationAccuracy = '/api/v1/admin/languages/translation-accuracy';

/** GET /api/v1/admin/me/permissions */
export const mePermissions = '/api/v1/admin/me/permissions';

/** GET /api/v1/admin/messages */
export const messages = '/api/v1/admin/messages';

/** GET /api/v1/admin/messages/engagement */
export const messagesEngagement = '/api/v1/admin/messages/engagement';

/** GET /api/v1/admin/messages/stats */
export const messagesStats = '/api/v1/admin/messages/stats';

/** GET /api/v1/admin/messages/trends */
export const messagesTrends = '/api/v1/admin/messages/trends';

/** GET /api/v1/admin/monitoring */
export const monitoring = '/api/v1/admin/monitoring';

/** GET /api/v1/admin/posts */
export const posts = '/api/v1/admin/posts';

/** GET · DELETE /api/v1/admin/posts/:postId */
export const postsByPostId = (postId: string): string => `/api/v1/admin/posts/${encodeURIComponent(postId)}`;

/** GET /api/v1/admin/posts/stats */
export const postsStats = '/api/v1/admin/posts/stats';

/** GET /api/v1/admin/ranking */
export const ranking = '/api/v1/admin/ranking';

/** GET · POST /api/v1/admin/reports */
export const reports = '/api/v1/admin/reports';

/** GET · PATCH · DELETE /api/v1/admin/reports/:id */
export const reportsById = (id: string): string => `/api/v1/admin/reports/${encodeURIComponent(id)}`;

/** POST /api/v1/admin/reports/:id/assign */
export const reportsByIdAssign = (id: string): string => `/api/v1/admin/reports/${encodeURIComponent(id)}/assign`;

/** GET /api/v1/admin/reports/entity/:type/:id */
export const reportsEntityByTypeById = (type: string, id: string): string => `/api/v1/admin/reports/entity/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;

/** GET /api/v1/admin/reports/moderator/mine */
export const reportsModeratorMine = '/api/v1/admin/reports/moderator/mine';

/** GET /api/v1/admin/reports/recent */
export const reportsRecent = '/api/v1/admin/reports/recent';

/** GET /api/v1/admin/reports/stats */
export const reportsStats = '/api/v1/admin/reports/stats';

/** GET /api/v1/admin/route-usage */
export const routeUsage = '/api/v1/admin/route-usage';

/** GET /api/v1/admin/share-links */
export const shareLinks = '/api/v1/admin/share-links';

/** GET · PATCH · DELETE /api/v1/admin/share-links/:id */
export const shareLinksById = (id: string): string => `/api/v1/admin/share-links/${encodeURIComponent(id)}`;

/** POST /api/v1/admin/share-links/:id/reveal */
export const shareLinksByIdReveal = (id: string): string => `/api/v1/admin/share-links/${encodeURIComponent(id)}/reveal`;

/** GET /api/v1/admin/tracking-links */
export const trackingLinks = '/api/v1/admin/tracking-links';

/** GET · PATCH /api/v1/admin/tracking-links/:linkId */
export const trackingLinksByLinkId = (linkId: string): string => `/api/v1/admin/tracking-links/${encodeURIComponent(linkId)}`;

/** GET /api/v1/admin/translations */
export const translations = '/api/v1/admin/translations';

/** GET · POST /api/v1/admin/users */
export const users = '/api/v1/admin/users';

/** GET · PATCH · DELETE /api/v1/admin/users/:userId */
export const usersByUserId = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}`;

/** GET /api/v1/admin/users/:userId/activity */
export const usersByUserIdActivity = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/activity`;

/** POST /api/v1/admin/users/:userId/ban */
export const usersByUserIdBan = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/ban`;

/** GET /api/v1/admin/users/:userId/bans */
export const usersByUserIdBans = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/bans`;

/** POST /api/v1/admin/users/:userId/bans/:banId/lift */
export const usersByUserIdBansByBanIdLift = (userId: string, banId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/bans/${encodeURIComponent(banId)}/lift`;

/** GET /api/v1/admin/users/:userId/communities */
export const usersByUserIdCommunities = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/communities`;

/** PATCH /api/v1/admin/users/:userId/consents */
export const usersByUserIdConsents = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/consents`;

/** GET /api/v1/admin/users/:userId/conversations */
export const usersByUserIdConversations = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/conversations`;

/** POST /api/v1/admin/users/:userId/disable-2fa */
export const usersByUserIdDisable2Fa = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/disable-2fa`;

/** POST /api/v1/admin/users/:userId/enable-2fa */
export const usersByUserIdEnable2Fa = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/enable-2fa`;

/** GET /api/v1/admin/users/:userId/media */
export const usersByUserIdMedia = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/media`;

/** POST /api/v1/admin/users/:userId/password-proposals */
export const usersByUserIdPasswordProposals = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/password-proposals`;

/** GET /api/v1/admin/users/:userId/preferences */
export const usersByUserIdPreferences = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/preferences`;

/** PATCH /api/v1/admin/users/:userId/preferences/:category */
export const usersByUserIdPreferencesByCategory = (userId: string, category: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/preferences/${encodeURIComponent(category)}`;

/** GET /api/v1/admin/users/:userId/profile-image-candidates */
export const usersByUserIdProfileImageCandidates = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/profile-image-candidates`;

/** PUT /api/v1/admin/users/:userId/profile-images/:kind */
export const usersByUserIdProfileImagesByKind = (userId: string, kind: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/profile-images/${encodeURIComponent(kind)}`;

/** GET /api/v1/admin/users/:userId/reported-messages */
export const usersByUserIdReportedMessages = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/reported-messages`;

/** GET /api/v1/admin/users/:userId/reports */
export const usersByUserIdReports = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/reports`;

/** POST /api/v1/admin/users/:userId/reset-password */
export const usersByUserIdResetPassword = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/reset-password`;

/** POST /api/v1/admin/users/:userId/restore */
export const usersByUserIdRestore = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/restore`;

/** PATCH /api/v1/admin/users/:userId/role */
export const usersByUserIdRole = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/role`;

/** PATCH /api/v1/admin/users/:userId/security */
export const usersByUserIdSecurity = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/security`;

/** GET /api/v1/admin/users/:userId/security-events */
export const usersByUserIdSecurityEvents = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/security-events`;

/** GET /api/v1/admin/users/:userId/sessions */
export const usersByUserIdSessions = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/sessions`;

/** DELETE /api/v1/admin/users/:userId/sessions/:sessionId */
export const usersByUserIdSessionsBySessionId = (userId: string, sessionId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`;

/** GET /api/v1/admin/users/:userId/stats */
export const usersByUserIdStats = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/stats`;

/** PATCH /api/v1/admin/users/:userId/status */
export const usersByUserIdStatus = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/status`;

/** POST /api/v1/admin/users/:userId/unlock */
export const usersByUserIdUnlock = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/unlock`;

/** POST /api/v1/admin/users/:userId/verification-requests */
export const usersByUserIdVerificationRequests = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/verification-requests`;

/** PATCH /api/v1/admin/users/:userId/verifications */
export const usersByUserIdVerifications = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/verifications`;

/** POST /api/v1/admin/users/:userId/verify-age */
export const usersByUserIdVerifyAge = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/verify-age`;

/** POST /api/v1/admin/users/:userId/verify-email */
export const usersByUserIdVerifyEmail = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/verify-email`;

/** POST /api/v1/admin/users/:userId/verify-phone */
export const usersByUserIdVerifyPhone = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/verify-phone`;

/** POST /api/v1/admin/users/:userId/voice-consent */
export const usersByUserIdVoiceConsent = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/voice-consent`;

/** GET /api/v1/admin/users/:userId/voice-profile */
export const usersByUserIdVoiceProfile = (userId: string): string => `/api/v1/admin/users/${encodeURIComponent(userId)}/voice-profile`;
