import UIKit
import UserNotifications
import MeeshySDK
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "push")

// MARK: - Injection seams

/// Background-task envelope around the whole action flow — iOS suspends the
/// process the instant the delegate callback returns unless the work is
/// covered by `beginBackgroundTask` (same hazard as the silent-push path,
/// see `SilentPushState`).
@MainActor
protocol BackgroundTaskScheduling {
    func beginTask(name: String, expirationHandler: (() -> Void)?) -> UIBackgroundTaskIdentifier
    func endTask(_ identifier: UIBackgroundTaskIdentifier)
}

@MainActor
struct UIApplicationBackgroundTaskScheduler: BackgroundTaskScheduling {
    func beginTask(name: String, expirationHandler: (() -> Void)?) -> UIBackgroundTaskIdentifier {
        UIApplication.shared.beginBackgroundTask(withName: name, expirationHandler: expirationHandler)
    }

    func endTask(_ identifier: UIBackgroundTaskIdentifier) {
        guard identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier)
    }
}

/// Slice of `OfflineQueue` the handler needs: the durable message path
/// (kind `.sendMessage`) and the generic mutation path (`.createComment`, …).
nonisolated protocol NotificationReplyQueueing {
    func enqueue(_ item: OfflineQueueItem) async throws
    @discardableResult
    func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P,
        conversationId: String?
    ) async throws -> String
}

extension OfflineQueue: NotificationReplyQueueing {}

/// Optimistic-write slice of `MessagePersistenceActor`.
nonisolated protocol OptimisticMessagePersisting {
    func insertOptimistic(_ record: MessageRecord) async throws
    func markOptimisticFailed(localId: String, reason: String) async throws
}

extension MessagePersistenceActor: OptimisticMessagePersisting {}

// MARK: - NotificationActionHandler

@MainActor
protocol NotificationActionHandling {
    func handle(
        actionIdentifier: String,
        userInfo: [AnyHashable: Any],
        replyText: String?
    ) async
}

/// R1/R2 — the injectable handler behind
/// `AppDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:)`.
///
/// Fixes the three background cold-launch defects of the previous inline
/// implementation:
///  1. the delegate used to call `completionHandler()` synchronously while the
///     work ran in a detached `Task` — iOS could suspend the process
///     mid-flight. The delegate now awaits `handle()` (which wraps itself in a
///     `beginBackgroundTask`) and calls the completion at the END.
///  2. `APIClient.shared.authToken` was never populated on a background
///     cold-launch (only the splash flow does), so every send died as a
///     silent 401. The handler pushes `AuthManager`'s lazy keychain-backed
///     token to the API client before any network call.
///  3. the quick reply was a bare `try?` REST call — a network failure lost
///     the text. It is now durable: optimistic `MessageRecord` + outbox
///     `.sendMessage` row FIRST, then the REST attempt; the gateway dedups by
///     `clientMessageId` so the outbox flusher can safely retry.
@MainActor
final class NotificationActionHandler: NotificationActionHandling {

    static let shared = NotificationActionHandler()

    private let messageService: MessageServiceProviding
    private let conversationService: ConversationServiceProviding
    private let postService: PostServiceProviding
    private let friendService: FriendServiceProviding
    private let replyQueue: NotificationReplyQueueing
    private let injectedPersistence: OptimisticMessagePersisting?
    private let backgroundTasks: BackgroundTaskScheduling
    private let authTokenProvider: () -> String?
    private let applyAuthToken: (String?) -> Void
    private let currentUserId: () -> String?
    private let preferredLanguage: () -> String?
    private let isRegisteredUser: () -> Bool
    private let openNotification: ([AnyHashable: Any]) -> Void
    private let localMarkRead: (String) -> Void
    private let removeDeliveredForConversation: (String) -> Void
    private let removeDeliveredForPost: (String) -> Void

    /// Resolved lazily so tests never touch `DependencyContainer.shared`
    /// (which opens the on-disk GRDB pool).
    private var messagePersistence: OptimisticMessagePersisting {
        injectedPersistence ?? DependencyContainer.shared.messagePersistence
    }

    init(
        messageService: MessageServiceProviding = MessageService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        postService: PostServiceProviding = PostService.shared,
        friendService: FriendServiceProviding = FriendService.shared,
        replyQueue: NotificationReplyQueueing = OfflineQueue.shared,
        messagePersistence: OptimisticMessagePersisting? = nil,
        backgroundTasks: BackgroundTaskScheduling = UIApplicationBackgroundTaskScheduler(),
        authTokenProvider: @escaping () -> String? = { AuthManager.shared.authToken },
        applyAuthToken: @escaping (String?) -> Void = { APIClient.shared.authToken = $0 },
        currentUserId: @escaping () -> String? = { AuthManager.shared.currentUser?.id },
        preferredLanguage: @escaping () -> String? = {
            AuthManager.shared.currentUser?.preferredContentLanguages.first
        },
        isRegisteredUser: @escaping () -> Bool = {
            guard let user = AuthManager.shared.currentUser else { return false }
            return user.isAnonymous != true
        },
        openNotification: @escaping ([AnyHashable: Any]) -> Void = {
            PushNotificationManager.shared.handleNotification(userInfo: $0)
        },
        localMarkRead: @escaping (String) -> Void = { conversationId in
            NotificationCoordinator.shared.markConversationRead(conversationId)
            NotificationCenter.default.post(name: .conversationMarkedRead, object: conversationId)
        },
        removeDeliveredForConversation: @escaping (String) -> Void = { conversationId in
            NotificationActionHandler.removeDeliveredNotifications(
                matching: { ($0["conversationId"] as? String) == conversationId }
            )
        },
        removeDeliveredForPost: @escaping (String) -> Void = { postId in
            NotificationActionHandler.removeDeliveredNotifications(
                matching: { ($0["postId"] as? String) == postId }
            )
        }
    ) {
        self.messageService = messageService
        self.conversationService = conversationService
        self.postService = postService
        self.friendService = friendService
        self.replyQueue = replyQueue
        self.injectedPersistence = messagePersistence
        self.backgroundTasks = backgroundTasks
        self.authTokenProvider = authTokenProvider
        self.applyAuthToken = applyAuthToken
        self.currentUserId = currentUserId
        self.preferredLanguage = preferredLanguage
        self.isRegisteredUser = isRegisteredUser
        self.openNotification = openNotification
        self.localMarkRead = localMarkRead
        self.removeDeliveredForConversation = removeDeliveredForConversation
        self.removeDeliveredForPost = removeDeliveredForPost
    }

    // MARK: - Entry point

    func handle(
        actionIdentifier: String,
        userInfo: [AnyHashable: Any],
        replyText: String?
    ) async {
        let taskId = backgroundTasks.beginTask(
            name: "meeshy.notification-action",
            expirationHandler: nil
        )
        defer { backgroundTasks.endTask(taskId) }

        // Background cold-launch never runs `checkExistingSession`, so
        // `APIClient.shared.authToken` is nil even though the Keychain has a
        // valid JWT. `AuthManager.authToken` reads the Keychain lazily —
        // push it to the API client before ANY network call.
        applyAuthToken(authTokenProvider())

        let payload = NotificationPayload(userInfo: userInfo)

        switch actionIdentifier {
        case UNNotificationDefaultActionIdentifier:
            openNotification(userInfo)

        case UNNotificationDismissActionIdentifier:
            break

        case MeeshyNotificationAction.markRead.rawValue:
            await handleMarkRead(payload)

        case MeeshyNotificationAction.reply.rawValue:
            await handleReply(payload, replyText: replyText)

        case MeeshyNotificationAction.view.rawValue,
             MeeshyNotificationAction.accept.rawValue,
             MeeshyNotificationAction.decline.rawValue,
             MeeshyNotificationAction.callback.rawValue,
             MeeshyNotificationAction.answerCall.rawValue:
            // All of these surface the app to the relevant screen — the
            // deep-link router decides the destination based on payload.type.
            openNotification(userInfo)

        case MeeshyNotificationAction.declineCall.rawValue:
            // Silent decline — no navigation. The VoIP layer handles the
            // actual decline via CallKit; APNs declineCall is just
            // bookkeeping so we don't reopen the call screen.
            break

        default:
            openNotification(userInfo)
        }
    }

    // MARK: - Mark read

    private func handleMarkRead(_ payload: NotificationPayload) async {
        guard let conversationId = payload.conversationId else { return }
        localMarkRead(conversationId)
        do {
            try await conversationService.markRead(conversationId: conversationId)
        } catch {
            logger.error("markRead REST failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
        removeDeliveredForConversation(conversationId)
    }

    // MARK: - Durable quick reply (R2)

    private func handleReply(_ payload: NotificationPayload, replyText: String?) async {
        guard let conversationId = payload.conversationId else {
            logger.warning("reply action without conversationId — ignoring")
            return
        }
        let text = (replyText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            logger.warning("reply action with empty text — ignoring")
            return
        }
        guard let userId = currentUserId() else {
            logger.warning("reply action without an active user — ignoring")
            return
        }

        let originalLanguage = preferredLanguage()
        let item = OfflineQueueItem(
            conversationId: conversationId,
            content: text,
            originalLanguage: originalLanguage,
            replyToId: payload.messageId
        )

        do {
            try await messagePersistence.insertOptimistic(
                makeOptimisticReplyRecord(
                    item: item,
                    senderId: userId,
                    replyToId: payload.messageId
                )
            )
        } catch {
            logger.error("reply optimistic insert failed: \(error.localizedDescription, privacy: .public)")
        }

        var outboxRowLanded = false
        do {
            try await replyQueue.enqueue(item)
            outboxRowLanded = true
        } catch {
            logger.error("reply outbox enqueue failed: \(error.localizedDescription, privacy: .public)")
        }

        do {
            let request = SendMessageRequest(
                content: text,
                originalLanguage: originalLanguage,
                replyToId: payload.messageId,
                clientMessageId: item.clientMessageId
            )
            _ = try await messageService.send(conversationId: conversationId, request: request)
            logger.info("notification reply sent for conversation \(conversationId, privacy: .public)")
        } catch {
            logger.error("reply REST send failed: \(error.localizedDescription, privacy: .public)")
            if !outboxRowLanded {
                do {
                    try await messagePersistence.markOptimisticFailed(
                        localId: item.clientMessageId,
                        reason: error.localizedDescription
                    )
                } catch {
                    logger.error("reply markOptimisticFailed failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        localMarkRead(conversationId)
        do {
            try await conversationService.markRead(conversationId: conversationId)
        } catch {
            logger.error("post-reply markRead failed: \(error.localizedDescription, privacy: .public)")
        }
        removeDeliveredForConversation(conversationId)
    }

    private func makeOptimisticReplyRecord(
        item: OfflineQueueItem,
        senderId: String,
        replyToId: String?
    ) -> MessageRecord {
        MessageRecord(
            localId: item.clientMessageId, serverId: nil,
            conversationId: item.conversationId, senderId: senderId,
            content: item.content,
            originalLanguage: item.originalLanguage ?? "fr",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sending, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: replyToId, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 0
        )
    }

    // MARK: - Notification hygiene

    /// Remove already-delivered banners matching the predicate. Without this,
    /// after a lock-screen action the banner lingers in Notification Center
    /// while the coordinator's badge count says 0.
    nonisolated static func removeDeliveredNotifications(
        matching predicate: @escaping @Sendable ([AnyHashable: Any]) -> Bool
    ) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { notifications in
            let matching = notifications
                .filter { predicate($0.request.content.userInfo) }
                .map(\.request.identifier)
            guard !matching.isEmpty else { return }
            center.removeDeliveredNotifications(withIdentifiers: matching)
        }
    }
}
