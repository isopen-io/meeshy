import FirebaseAnalytics
import MeeshySDK
import os

@MainActor
final class AnalyticsManager {
    static let shared = AnalyticsManager()

    private let logger = Logger(subsystem: "me.meeshy.app", category: "analytics")

    private init() {
        syncCollectionState()
    }

    // MARK: - Collection Toggle

    func syncCollectionState() {
        let enabled = UserPreferencesManager.shared.privacy.allowAnalytics
        Analytics.setAnalyticsCollectionEnabled(enabled)
        logger.info("Analytics collection \(enabled ? "enabled" : "disabled")")
    }

    // MARK: - Screen Tracking

    func trackScreen(_ screenName: String, screenClass: String? = nil) {
        Analytics.logEvent(AnalyticsEventScreenView, parameters: [
            AnalyticsParameterScreenName: screenName,
            AnalyticsParameterScreenClass: screenClass ?? screenName
        ])
    }

    // MARK: - Route-based Screen Tracking

    func trackRoute(_ route: Route?) {
        let screenName = route?.analyticsScreenName ?? "ConversationList"
        trackScreen(screenName)
    }
}

// MARK: - Route Analytics Names

extension Route {
    var analyticsScreenName: String {
        switch self {
        case .conversation: return "Conversation"
        case .settings: return "Settings"
        case .profile: return "Profile"
        case .contacts: return "Contacts"
        case .peopleDiscovery: return "PeopleDiscovery"
        case .communityList: return "CommunityList"
        case .communityDetail: return "CommunityDetail"
        case .communityCreate: return "CommunityCreate"
        case .communitySettings: return "CommunitySettings"
        case .communityMembers: return "CommunityMembers"
        case .communityInvite: return "CommunityInvite"
        case .notifications: return "Notifications"
        case .userStats: return "UserStats"
        case .links: return "Links"
        case .affiliate: return "Affiliate"
        case .trackingLinks: return "TrackingLinks"
        case .shareLinks: return "ShareLinks"
        case .communityLinks: return "CommunityLinks"
        case .dataExport: return "DataExport"
        case .postDetail: return "PostDetail"
        case .bookmarks: return "Bookmarks"
        case .starredMessages: return "StarredMessages"
        case .friendRequests: return "FriendRequests"
        case .editProfile: return "EditProfile"
        case .storyNotificationTarget: return "StoryNotificationTarget"
        }
    }
}
