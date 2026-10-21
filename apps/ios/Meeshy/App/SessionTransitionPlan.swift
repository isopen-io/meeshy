enum SessionOpeningStep: Equatable {
    case tagCrashReports(userId: String?)
    case replayShareLinkAwaitingAccount
    case startNotificationCoordinators
    case startCache
    case configureStoryPublishing
    case hydrateFriendships
    case reconnectSockets
    case activateConversationStoreBridge
    case promptPushPermission
    case refreshUnreadCount
    case reRegisterPushTokens
    case uploadE2EEBundle
    case migrateKeychain
}

enum SessionClosingStep: Equatable {
    case untagCrashReports
    case resetNotifications
    case clearFriendships
    case clearE2EESessions
    case unbindCache
    case unregisterVoIP
    case endActiveCall
    case disconnectSockets
    case stopSocketRelays
    case cancelBackgroundTasks
}

struct SessionTransitionContext: Equatable {
    let userId: String?
    let friendshipsHydrated: Bool
    let hasActiveCall: Bool
}

enum SessionTransitionPlan {
    static func opening(_ context: SessionTransitionContext) -> [SessionOpeningStep] {
        []
    }

    static func closing(_ context: SessionTransitionContext) -> [SessionClosingStep] {
        []
    }
}
