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
    case broadcasts
    case broadcastsById(id: String)
    case broadcastsByIdPreview(id: String)
    case broadcastsByIdSend(id: String)
    case broadcastsByIdSendInapp(id: String)
    case communities
    case conversationsByConversationIdMessages(conversationId: String)
    case conversationsByConversationIdParticipants(conversationId: String)
    case dashboard
    case dashboardInvalidateCache
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
    case posts
    case postsByPostId(postId: String)
    case postsStats
    case ranking
    case reports
    case reportsById(id: String)
    case reportsByIdAssign(id: String)
    case reportsEntityByTypeById(type: String, id: String)
    case reportsModeratorMine
    case reportsRecent
    case reportsStats
    case routeUsage
    case shareLinks
    case shareLinksById(id: String)
    case shareLinksByIdReveal(id: String)
    case translations
    case users
    case usersByUserId(userId: String)
    case usersByUserIdActivity(userId: String)
    case usersByUserIdConsents(userId: String)
    case usersByUserIdConversations(userId: String)
    case usersByUserIdDisable2Fa(userId: String)
    case usersByUserIdEnable2Fa(userId: String)
    case usersByUserIdMedia(userId: String)
    case usersByUserIdReportedMessages(userId: String)
    case usersByUserIdReports(userId: String)
    case usersByUserIdResetPassword(userId: String)
    case usersByUserIdRole(userId: String)
    case usersByUserIdSecurity(userId: String)
    case usersByUserIdStatus(userId: String)
    case usersByUserIdUnlock(userId: String)
    case usersByUserIdVerifications(userId: String)
    case usersByUserIdVerifyAge(userId: String)
    case usersByUserIdVerifyEmail(userId: String)
    case usersByUserIdVerifyPhone(userId: String)
    case usersByUserIdVoiceConsent(userId: String)

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
        case .broadcasts: return "/api/v1/admin/broadcasts"
        case .broadcastsById(let id): return "/api/v1/admin/broadcasts/\(id)"
        case .broadcastsByIdPreview(let id): return "/api/v1/admin/broadcasts/\(id)/preview"
        case .broadcastsByIdSend(let id): return "/api/v1/admin/broadcasts/\(id)/send"
        case .broadcastsByIdSendInapp(let id): return "/api/v1/admin/broadcasts/\(id)/send-inapp"
        case .communities: return "/api/v1/admin/communities"
        case .conversationsByConversationIdMessages(let conversationId): return "/api/v1/admin/conversations/\(conversationId)/messages"
        case .conversationsByConversationIdParticipants(let conversationId): return "/api/v1/admin/conversations/\(conversationId)/participants"
        case .dashboard: return "/api/v1/admin/dashboard"
        case .dashboardInvalidateCache: return "/api/v1/admin/dashboard/invalidate-cache"
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
        case .posts: return "/api/v1/admin/posts"
        case .postsByPostId(let postId): return "/api/v1/admin/posts/\(postId)"
        case .postsStats: return "/api/v1/admin/posts/stats"
        case .ranking: return "/api/v1/admin/ranking"
        case .reports: return "/api/v1/admin/reports"
        case .reportsById(let id): return "/api/v1/admin/reports/\(id)"
        case .reportsByIdAssign(let id): return "/api/v1/admin/reports/\(id)/assign"
        case .reportsEntityByTypeById(let type, let id): return "/api/v1/admin/reports/entity/\(type)/\(id)"
        case .reportsModeratorMine: return "/api/v1/admin/reports/moderator/mine"
        case .reportsRecent: return "/api/v1/admin/reports/recent"
        case .reportsStats: return "/api/v1/admin/reports/stats"
        case .routeUsage: return "/api/v1/admin/route-usage"
        case .shareLinks: return "/api/v1/admin/share-links"
        case .shareLinksById(let id): return "/api/v1/admin/share-links/\(id)"
        case .shareLinksByIdReveal(let id): return "/api/v1/admin/share-links/\(id)/reveal"
        case .translations: return "/api/v1/admin/translations"
        case .users: return "/api/v1/admin/users"
        case .usersByUserId(let userId): return "/api/v1/admin/users/\(userId)"
        case .usersByUserIdActivity(let userId): return "/api/v1/admin/users/\(userId)/activity"
        case .usersByUserIdConsents(let userId): return "/api/v1/admin/users/\(userId)/consents"
        case .usersByUserIdConversations(let userId): return "/api/v1/admin/users/\(userId)/conversations"
        case .usersByUserIdDisable2Fa(let userId): return "/api/v1/admin/users/\(userId)/disable-2fa"
        case .usersByUserIdEnable2Fa(let userId): return "/api/v1/admin/users/\(userId)/enable-2fa"
        case .usersByUserIdMedia(let userId): return "/api/v1/admin/users/\(userId)/media"
        case .usersByUserIdReportedMessages(let userId): return "/api/v1/admin/users/\(userId)/reported-messages"
        case .usersByUserIdReports(let userId): return "/api/v1/admin/users/\(userId)/reports"
        case .usersByUserIdResetPassword(let userId): return "/api/v1/admin/users/\(userId)/reset-password"
        case .usersByUserIdRole(let userId): return "/api/v1/admin/users/\(userId)/role"
        case .usersByUserIdSecurity(let userId): return "/api/v1/admin/users/\(userId)/security"
        case .usersByUserIdStatus(let userId): return "/api/v1/admin/users/\(userId)/status"
        case .usersByUserIdUnlock(let userId): return "/api/v1/admin/users/\(userId)/unlock"
        case .usersByUserIdVerifications(let userId): return "/api/v1/admin/users/\(userId)/verifications"
        case .usersByUserIdVerifyAge(let userId): return "/api/v1/admin/users/\(userId)/verify-age"
        case .usersByUserIdVerifyEmail(let userId): return "/api/v1/admin/users/\(userId)/verify-email"
        case .usersByUserIdVerifyPhone(let userId): return "/api/v1/admin/users/\(userId)/verify-phone"
        case .usersByUserIdVoiceConsent(let userId): return "/api/v1/admin/users/\(userId)/voice-consent"
        }
    }
}
