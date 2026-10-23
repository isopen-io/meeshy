// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run ios-endpoints:generate
//
// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des
// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.

import Foundation

public enum AdminEndpoint: MeeshyEndpoint, Sendable {
    case agentArchetypes
    case agentConfigs
    case agentConfigsByConversationId(conversationId: String)
    case agentConfigsByConversationIdLive(conversationId: String)
    case agentConfigsByConversationIdMessages(conversationId: String)
    case agentConfigsByConversationIdRoles(conversationId: String)
    case agentConfigsByConversationIdSchedule(conversationId: String)
    case agentConfigsByConversationIdStop(conversationId: String)
    case agentConfigsByConversationIdSummary(conversationId: String)
    case agentConfigsByConversationIdTrigger(conversationId: String)
    case agentDeliveryQueue
    case agentDeliveryQueueById(id: String)
    case agentGlobalConfig
    case agentLlm
    case agentRecentActivity
    case agentReset
    case agentResetConversationByConversationId(conversationId: String)
    case agentResetUserByUserId(userId: String)
    case agentRolesByConversationIdByUserIdAssign(conversationId: String, userId: String)
    case agentRolesByConversationIdByUserIdUnlock(conversationId: String, userId: String)
    case agentScanLogs
    case agentScanLogsByLogId(logId: String)
    case agentScanLogsStats
    case agentStats
    case agentTopics
    case agentTopicsById(id: String)
    case agentTopicsByIdTest(id: String)
    case analyticsCalls
    case analyticsHourlyActivity
    case analyticsKpis
    case analyticsLanguageDistribution
    case analyticsMessageTypes
    case analyticsRealtime
    case analyticsUserDistribution
    case analyticsVolumeTimeline
    case anonymousUsers
    case anonymousUsersByParticipantId(participantId: String)
    case auditLogs
    case broadcasts
    case broadcastsById(id: String)
    case broadcastsByIdPreview(id: String)
    case broadcastsByIdSend(id: String)
    case broadcastsByIdSendInapp(id: String)
    case commentsByCommentIdRemove(commentId: String)
    case communities
    case communitiesByCommunityId(communityId: String)
    case communitiesByCommunityIdMembers(communityId: String)
    case conversations
    case conversationsByConversationId(conversationId: String)
    case conversationsByConversationIdAttachments(conversationId: String)
    case conversationsByConversationIdMessages(conversationId: String)
    case conversationsByConversationIdParticipants(conversationId: String)
    case conversationsByConversationIdParticipantsByUserId(conversationId: String, userId: String)
    case conversationsByConversationIdParticipantsByUserIdRemove(conversationId: String, userId: String)
    case dashboard
    case dashboardInvalidateCache
    case engagementScale
    case gameSeasons
    case gameSeasonsAppEvents
    case gameSeasonsAppEventsYaml
    case gameSeasonsByNumber(number: String)
    case gameSeasonsByNumberProposals(number: String)
    case gameSeasonsProposals
    case gameSeasonsProposalsByIdApprove(id: String)
    case gameSeasonsProposalsByIdReject(id: String)
    case invitations
    case invitationsById(id: String)
    case invitationsStats
    case invitationsTimelineDaily
    case languagesStats
    case languagesTimeline
    case languagesTranslationAccuracy
    case mePermissions
    case messages
    case messagesEngagement
    case messagesStats
    case messagesTrends
    case monitoring
    case opsByOperation(operation: String)
    case opsContainers
    case opsHostMetrics
    case opsStatus
    case packsRegistry
    case packsRegistryByDomainBySlug(domain: String, slug: String)
    case posts
    case postsByPostId(postId: String)
    case postsByPostIdGestures(postId: String)
    case postsGestures
    case postsStats
    case ranking
    case reports
    case reportsById(id: String)
    case reportsByIdAssign(id: String)
    case reportsByReportIdAct(reportId: String)
    case reportsEntityByTypeById(type: String, id: String)
    case reportsModeratorMine
    case reportsRecent
    case reportsStats
    case routeUsage
    case shareLinks
    case shareLinksById(id: String)
    case shareLinksByIdReveal(id: String)
    case trackingLinks
    case trackingLinksByLinkId(linkId: String)
    case translations
    case users
    case usersByUserId(userId: String)
    case usersByUserIdActivity(userId: String)
    case usersByUserIdBan(userId: String)
    case usersByUserIdBans(userId: String)
    case usersByUserIdBansByBanIdLift(userId: String, banId: String)
    case usersByUserIdCommunities(userId: String)
    case usersByUserIdConsents(userId: String)
    case usersByUserIdConversations(userId: String)
    case usersByUserIdDisable2Fa(userId: String)
    case usersByUserIdEnable2Fa(userId: String)
    case usersByUserIdMedia(userId: String)
    case usersByUserIdPasswordProposals(userId: String)
    case usersByUserIdPreferences(userId: String)
    case usersByUserIdPreferencesByCategory(userId: String, category: String)
    case usersByUserIdProfileImageCandidates(userId: String)
    case usersByUserIdProfileImagesByKind(userId: String, kind: String)
    case usersByUserIdPublications(userId: String)
    case usersByUserIdPublicationsModeration(userId: String)
    case usersByUserIdReportedMessages(userId: String)
    case usersByUserIdReports(userId: String)
    case usersByUserIdResetPassword(userId: String)
    case usersByUserIdRestore(userId: String)
    case usersByUserIdRole(userId: String)
    case usersByUserIdSecurity(userId: String)
    case usersByUserIdSecurityEvents(userId: String)
    case usersByUserIdSessions(userId: String)
    case usersByUserIdSessionsBySessionId(userId: String, sessionId: String)
    case usersByUserIdStats(userId: String)
    case usersByUserIdStatus(userId: String)
    case usersByUserIdUnlock(userId: String)
    case usersByUserIdVerificationRequests(userId: String)
    case usersByUserIdVerifications(userId: String)
    case usersByUserIdVerifyAge(userId: String)
    case usersByUserIdVerifyEmail(userId: String)
    case usersByUserIdVerifyPhone(userId: String)
    case usersByUserIdVoiceConsent(userId: String)
    case usersByUserIdVoiceProfile(userId: String)

    public var path: String {
        switch self {
        case .agentArchetypes: return "/api/v1/admin/agent/archetypes"
        case .agentConfigs: return "/api/v1/admin/agent/configs"
        case .agentConfigsByConversationId(let conversationId): return "/api/v1/admin/agent/configs/\(conversationId)"
        case .agentConfigsByConversationIdLive(let conversationId): return "/api/v1/admin/agent/configs/\(conversationId)/live"
        case .agentConfigsByConversationIdMessages(let conversationId): return "/api/v1/admin/agent/configs/\(conversationId)/messages"
        case .agentConfigsByConversationIdRoles(let conversationId): return "/api/v1/admin/agent/configs/\(conversationId)/roles"
        case .agentConfigsByConversationIdSchedule(let conversationId): return "/api/v1/admin/agent/configs/\(conversationId)/schedule"
        case .agentConfigsByConversationIdStop(let conversationId): return "/api/v1/admin/agent/configs/\(conversationId)/stop"
        case .agentConfigsByConversationIdSummary(let conversationId): return "/api/v1/admin/agent/configs/\(conversationId)/summary"
        case .agentConfigsByConversationIdTrigger(let conversationId): return "/api/v1/admin/agent/configs/\(conversationId)/trigger"
        case .agentDeliveryQueue: return "/api/v1/admin/agent/delivery-queue"
        case .agentDeliveryQueueById(let id): return "/api/v1/admin/agent/delivery-queue/\(id)"
        case .agentGlobalConfig: return "/api/v1/admin/agent/global-config"
        case .agentLlm: return "/api/v1/admin/agent/llm"
        case .agentRecentActivity: return "/api/v1/admin/agent/recent-activity"
        case .agentReset: return "/api/v1/admin/agent/reset"
        case .agentResetConversationByConversationId(let conversationId): return "/api/v1/admin/agent/reset/conversation/\(conversationId)"
        case .agentResetUserByUserId(let userId): return "/api/v1/admin/agent/reset/user/\(userId)"
        case .agentRolesByConversationIdByUserIdAssign(let conversationId, let userId): return "/api/v1/admin/agent/roles/\(conversationId)/\(userId)/assign"
        case .agentRolesByConversationIdByUserIdUnlock(let conversationId, let userId): return "/api/v1/admin/agent/roles/\(conversationId)/\(userId)/unlock"
        case .agentScanLogs: return "/api/v1/admin/agent/scan-logs"
        case .agentScanLogsByLogId(let logId): return "/api/v1/admin/agent/scan-logs/\(logId)"
        case .agentScanLogsStats: return "/api/v1/admin/agent/scan-logs/stats"
        case .agentStats: return "/api/v1/admin/agent/stats"
        case .agentTopics: return "/api/v1/admin/agent/topics"
        case .agentTopicsById(let id): return "/api/v1/admin/agent/topics/\(id)"
        case .agentTopicsByIdTest(let id): return "/api/v1/admin/agent/topics/\(id)/test"
        case .analyticsCalls: return "/api/v1/admin/analytics/calls"
        case .analyticsHourlyActivity: return "/api/v1/admin/analytics/hourly-activity"
        case .analyticsKpis: return "/api/v1/admin/analytics/kpis"
        case .analyticsLanguageDistribution: return "/api/v1/admin/analytics/language-distribution"
        case .analyticsMessageTypes: return "/api/v1/admin/analytics/message-types"
        case .analyticsRealtime: return "/api/v1/admin/analytics/realtime"
        case .analyticsUserDistribution: return "/api/v1/admin/analytics/user-distribution"
        case .analyticsVolumeTimeline: return "/api/v1/admin/analytics/volume-timeline"
        case .anonymousUsers: return "/api/v1/admin/anonymous-users"
        case .anonymousUsersByParticipantId(let participantId): return "/api/v1/admin/anonymous-users/\(participantId)"
        case .auditLogs: return "/api/v1/admin/audit-logs"
        case .broadcasts: return "/api/v1/admin/broadcasts"
        case .broadcastsById(let id): return "/api/v1/admin/broadcasts/\(id)"
        case .broadcastsByIdPreview(let id): return "/api/v1/admin/broadcasts/\(id)/preview"
        case .broadcastsByIdSend(let id): return "/api/v1/admin/broadcasts/\(id)/send"
        case .broadcastsByIdSendInapp(let id): return "/api/v1/admin/broadcasts/\(id)/send-inapp"
        case .commentsByCommentIdRemove(let commentId): return "/api/v1/admin/comments/\(commentId)/remove"
        case .communities: return "/api/v1/admin/communities"
        case .communitiesByCommunityId(let communityId): return "/api/v1/admin/communities/\(communityId)"
        case .communitiesByCommunityIdMembers(let communityId): return "/api/v1/admin/communities/\(communityId)/members"
        case .conversations: return "/api/v1/admin/conversations"
        case .conversationsByConversationId(let conversationId): return "/api/v1/admin/conversations/\(conversationId)"
        case .conversationsByConversationIdAttachments(let conversationId): return "/api/v1/admin/conversations/\(conversationId)/attachments"
        case .conversationsByConversationIdMessages(let conversationId): return "/api/v1/admin/conversations/\(conversationId)/messages"
        case .conversationsByConversationIdParticipants(let conversationId): return "/api/v1/admin/conversations/\(conversationId)/participants"
        case .conversationsByConversationIdParticipantsByUserId(let conversationId, let userId): return "/api/v1/admin/conversations/\(conversationId)/participants/\(userId)"
        case .conversationsByConversationIdParticipantsByUserIdRemove(let conversationId, let userId): return "/api/v1/admin/conversations/\(conversationId)/participants/\(userId)/remove"
        case .dashboard: return "/api/v1/admin/dashboard"
        case .dashboardInvalidateCache: return "/api/v1/admin/dashboard/invalidate-cache"
        case .engagementScale: return "/api/v1/admin/engagement-scale"
        case .gameSeasons: return "/api/v1/admin/game/seasons"
        case .gameSeasonsAppEvents: return "/api/v1/admin/game/seasons/app-events"
        case .gameSeasonsAppEventsYaml: return "/api/v1/admin/game/seasons/app-events.yaml"
        case .gameSeasonsByNumber(let number): return "/api/v1/admin/game/seasons/\(number)"
        case .gameSeasonsByNumberProposals(let number): return "/api/v1/admin/game/seasons/\(number)/proposals"
        case .gameSeasonsProposals: return "/api/v1/admin/game/seasons/proposals"
        case .gameSeasonsProposalsByIdApprove(let id): return "/api/v1/admin/game/seasons/proposals/\(id)/approve"
        case .gameSeasonsProposalsByIdReject(let id): return "/api/v1/admin/game/seasons/proposals/\(id)/reject"
        case .invitations: return "/api/v1/admin/invitations"
        case .invitationsById(let id): return "/api/v1/admin/invitations/\(id)"
        case .invitationsStats: return "/api/v1/admin/invitations/stats"
        case .invitationsTimelineDaily: return "/api/v1/admin/invitations/timeline/daily"
        case .languagesStats: return "/api/v1/admin/languages/stats"
        case .languagesTimeline: return "/api/v1/admin/languages/timeline"
        case .languagesTranslationAccuracy: return "/api/v1/admin/languages/translation-accuracy"
        case .mePermissions: return "/api/v1/admin/me/permissions"
        case .messages: return "/api/v1/admin/messages"
        case .messagesEngagement: return "/api/v1/admin/messages/engagement"
        case .messagesStats: return "/api/v1/admin/messages/stats"
        case .messagesTrends: return "/api/v1/admin/messages/trends"
        case .monitoring: return "/api/v1/admin/monitoring"
        case .opsByOperation(let operation): return "/api/v1/admin/ops/\(operation)"
        case .opsContainers: return "/api/v1/admin/ops/containers"
        case .opsHostMetrics: return "/api/v1/admin/ops/host-metrics"
        case .opsStatus: return "/api/v1/admin/ops/status"
        case .packsRegistry: return "/api/v1/admin/packs/registry"
        case .packsRegistryByDomainBySlug(let domain, let slug): return "/api/v1/admin/packs/registry/\(domain)/\(slug)"
        case .posts: return "/api/v1/admin/posts"
        case .postsByPostId(let postId): return "/api/v1/admin/posts/\(postId)"
        case .postsByPostIdGestures(let postId): return "/api/v1/admin/posts/\(postId)/gestures"
        case .postsGestures: return "/api/v1/admin/posts/gestures"
        case .postsStats: return "/api/v1/admin/posts/stats"
        case .ranking: return "/api/v1/admin/ranking"
        case .reports: return "/api/v1/admin/reports"
        case .reportsById(let id): return "/api/v1/admin/reports/\(id)"
        case .reportsByIdAssign(let id): return "/api/v1/admin/reports/\(id)/assign"
        case .reportsByReportIdAct(let reportId): return "/api/v1/admin/reports/\(reportId)/act"
        case .reportsEntityByTypeById(let type, let id): return "/api/v1/admin/reports/entity/\(type)/\(id)"
        case .reportsModeratorMine: return "/api/v1/admin/reports/moderator/mine"
        case .reportsRecent: return "/api/v1/admin/reports/recent"
        case .reportsStats: return "/api/v1/admin/reports/stats"
        case .routeUsage: return "/api/v1/admin/route-usage"
        case .shareLinks: return "/api/v1/admin/share-links"
        case .shareLinksById(let id): return "/api/v1/admin/share-links/\(id)"
        case .shareLinksByIdReveal(let id): return "/api/v1/admin/share-links/\(id)/reveal"
        case .trackingLinks: return "/api/v1/admin/tracking-links"
        case .trackingLinksByLinkId(let linkId): return "/api/v1/admin/tracking-links/\(linkId)"
        case .translations: return "/api/v1/admin/translations"
        case .users: return "/api/v1/admin/users"
        case .usersByUserId(let userId): return "/api/v1/admin/users/\(userId)"
        case .usersByUserIdActivity(let userId): return "/api/v1/admin/users/\(userId)/activity"
        case .usersByUserIdBan(let userId): return "/api/v1/admin/users/\(userId)/ban"
        case .usersByUserIdBans(let userId): return "/api/v1/admin/users/\(userId)/bans"
        case .usersByUserIdBansByBanIdLift(let userId, let banId): return "/api/v1/admin/users/\(userId)/bans/\(banId)/lift"
        case .usersByUserIdCommunities(let userId): return "/api/v1/admin/users/\(userId)/communities"
        case .usersByUserIdConsents(let userId): return "/api/v1/admin/users/\(userId)/consents"
        case .usersByUserIdConversations(let userId): return "/api/v1/admin/users/\(userId)/conversations"
        case .usersByUserIdDisable2Fa(let userId): return "/api/v1/admin/users/\(userId)/disable-2fa"
        case .usersByUserIdEnable2Fa(let userId): return "/api/v1/admin/users/\(userId)/enable-2fa"
        case .usersByUserIdMedia(let userId): return "/api/v1/admin/users/\(userId)/media"
        case .usersByUserIdPasswordProposals(let userId): return "/api/v1/admin/users/\(userId)/password-proposals"
        case .usersByUserIdPreferences(let userId): return "/api/v1/admin/users/\(userId)/preferences"
        case .usersByUserIdPreferencesByCategory(let userId, let category): return "/api/v1/admin/users/\(userId)/preferences/\(category)"
        case .usersByUserIdProfileImageCandidates(let userId): return "/api/v1/admin/users/\(userId)/profile-image-candidates"
        case .usersByUserIdProfileImagesByKind(let userId, let kind): return "/api/v1/admin/users/\(userId)/profile-images/\(kind)"
        case .usersByUserIdPublications(let userId): return "/api/v1/admin/users/\(userId)/publications"
        case .usersByUserIdPublicationsModeration(let userId): return "/api/v1/admin/users/\(userId)/publications/moderation"
        case .usersByUserIdReportedMessages(let userId): return "/api/v1/admin/users/\(userId)/reported-messages"
        case .usersByUserIdReports(let userId): return "/api/v1/admin/users/\(userId)/reports"
        case .usersByUserIdResetPassword(let userId): return "/api/v1/admin/users/\(userId)/reset-password"
        case .usersByUserIdRestore(let userId): return "/api/v1/admin/users/\(userId)/restore"
        case .usersByUserIdRole(let userId): return "/api/v1/admin/users/\(userId)/role"
        case .usersByUserIdSecurity(let userId): return "/api/v1/admin/users/\(userId)/security"
        case .usersByUserIdSecurityEvents(let userId): return "/api/v1/admin/users/\(userId)/security-events"
        case .usersByUserIdSessions(let userId): return "/api/v1/admin/users/\(userId)/sessions"
        case .usersByUserIdSessionsBySessionId(let userId, let sessionId): return "/api/v1/admin/users/\(userId)/sessions/\(sessionId)"
        case .usersByUserIdStats(let userId): return "/api/v1/admin/users/\(userId)/stats"
        case .usersByUserIdStatus(let userId): return "/api/v1/admin/users/\(userId)/status"
        case .usersByUserIdUnlock(let userId): return "/api/v1/admin/users/\(userId)/unlock"
        case .usersByUserIdVerificationRequests(let userId): return "/api/v1/admin/users/\(userId)/verification-requests"
        case .usersByUserIdVerifications(let userId): return "/api/v1/admin/users/\(userId)/verifications"
        case .usersByUserIdVerifyAge(let userId): return "/api/v1/admin/users/\(userId)/verify-age"
        case .usersByUserIdVerifyEmail(let userId): return "/api/v1/admin/users/\(userId)/verify-email"
        case .usersByUserIdVerifyPhone(let userId): return "/api/v1/admin/users/\(userId)/verify-phone"
        case .usersByUserIdVoiceConsent(let userId): return "/api/v1/admin/users/\(userId)/voice-consent"
        case .usersByUserIdVoiceProfile(let userId): return "/api/v1/admin/users/\(userId)/voice-profile"
        }
    }
}
