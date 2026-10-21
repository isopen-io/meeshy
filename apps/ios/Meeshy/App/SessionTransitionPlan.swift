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
        let friendships: [SessionOpeningStep] = context.friendshipsHydrated ? [] : [.hydrateFriendships]
        return [
            [.tagCrashReports(userId: context.userId)],
            [.replayShareLinkAwaitingAccount, .startNotificationCoordinators, .startCache, .configureStoryPublishing],
            friendships,
            [.reconnectSockets, .activateConversationStoreBridge],
            [.promptPushPermission, .refreshUnreadCount, .reRegisterPushTokens],
            [.uploadE2EEBundle, .migrateKeychain],
        ].flatMap { $0 }
    }

    static func closing(_ context: SessionTransitionContext) -> [SessionClosingStep] {
        let endCall: [SessionClosingStep] = context.hasActiveCall ? [.endActiveCall] : []
        return [
            [.untagCrashReports, .resetNotifications, .clearFriendships, .clearE2EESessions, .unbindCache, .unregisterVoIP],
            endCall,
            [.disconnectSockets, .stopSocketRelays, .cancelBackgroundTasks],
        ].flatMap { $0 }
    }
}
