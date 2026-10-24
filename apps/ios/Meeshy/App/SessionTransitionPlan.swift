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
    /// #3707 — l'installation s'enrôle auprès de l'annuaire libsignal et ouvre ses enveloppes.
    case startEndToEnd(userId: String?)
    case migrateKeychain
}

enum SessionClosingStep: Equatable {
    case untagCrashReports
    case resetNotifications
    case clearFriendships
    case clearE2EESessions
    case stopEndToEnd
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
            [.startEndToEnd(userId: context.userId), .migrateKeychain],
        ].flatMap { $0 }
    }

    static func closing(_ context: SessionTransitionContext) -> [SessionClosingStep] {
        let endCall: [SessionClosingStep] = context.hasActiveCall ? [.endActiveCall] : []
        return [
            [.untagCrashReports, .resetNotifications, .clearFriendships, .clearE2EESessions, .stopEndToEnd, .unbindCache, .unregisterVoIP],
            endCall,
            [.disconnectSockets, .stopSocketRelays, .cancelBackgroundTasks],
        ].flatMap { $0 }
    }
}
