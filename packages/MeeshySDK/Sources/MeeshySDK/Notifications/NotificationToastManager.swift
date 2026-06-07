import Foundation
import Combine
import os

private let logger = Logger(subsystem: "me.meeshy.sdk", category: "notifications")

/// High-level orchestrator for in-app notifications.
///
/// Responsibilities split (read carefully before touching):
/// - **Toast / transient UI**: `currentToast` + dismiss timer — owned by this class.
/// - **Active conversation tracking**: suppresses self-authored toasts.
/// - **Unread count**: DELEGATED to `NotificationCoordinator`. Callers read
///   `unreadCount` here for API continuity, but the value is mirrored from the
///   coordinator — every mutation goes through the coordinator first.
///
/// The coordinator is the single source of truth for the notification bell, the
/// system badge and the widget data store. This class must not write directly to
/// `UIApplication.setBadgeCount` or to the App Group defaults.
@MainActor
public final class NotificationToastManager: ObservableObject {
    public static let shared = NotificationToastManager()

    /// Mirrors `NotificationCoordinator.inAppNotificationUnread`. Kept as a
    /// `@Published` convenience so legacy SwiftUI views that observe
    /// `NotificationToastManager.shared` continue to refresh without changes.
    @Published public private(set) var unreadCount: Int = 0

    @Published public private(set) var currentToast: SocketNotificationEvent?
    @Published public private(set) var activeConversationId: String?
    @Published public var activePostId: String?

    public let newNotificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    public let notificationMarkedRead = PassthroughSubject<String, Never>()
    public let notificationWasDeleted = PassthroughSubject<String, Never>()

    /// Émis quand toutes les notifications d'une conversation viennent d'être
    /// marquées lues (ouverture de la conversation). Permet à la liste in-app
    /// de mettre à jour ses lignes immédiatement, avant le refresh serveur.
    public let conversationNotificationsRead = PassthroughSubject<String, Never>()

    /// Optional hook the app target uses to inject the current iOS Focus
    /// filter snapshot. The SDK can't observe `SetFocusFilterIntent` directly
    /// (it lives in the app target), so we ask for a pull closure instead.
    public var focusFilterProvider: (@MainActor () -> FocusFilterSnapshot)?

    private var cancellables = Set<AnyCancellable>()
    private var toastDismissTask: Task<Void, Never>?
    private static let toastDuration: UInt64 = 7_000_000_000
    private static let refreshDelay: UInt64 = 500_000_000

    private init() {
        subscribeToCoordinator()
        subscribeToSocketEvents()
    }

    // MARK: - Public API

    public func refreshUnreadCount() async {
        do {
            let count = try await NotificationService.shared.unreadCount()
            NotificationCoordinator.shared.setInAppNotificationUnread(count)
        } catch {
            logger.error("Failed to refresh unread count: \(error.localizedDescription)")
        }
    }

    public func onConversationOpened(_ conversationId: String) {
        activeConversationId = conversationId
        MessageSocketManager.shared.activeConversationId = conversationId

        if let toast = currentToast, toast.conversationId == conversationId {
            dismissToast()
        }

        // Le contenu de la conversation est consommé : ses notifications ne
        // doivent plus apparaître comme non lues. On informe d'abord la liste
        // in-app (mise à jour optimiste instantanée), puis on marque côté serveur
        // (qui ré-émet `notification:counts` → la cloche/badge se recalent), et
        // enfin on rafraîchit le compteur pour récupérer la valeur autoritative.
        conversationNotificationsRead.send(conversationId)

        Task {
            try? await NotificationService.shared.markConversationRead(conversationId: conversationId)
            await refreshUnreadCount()
        }
    }

    public func onConversationClosed() {
        activeConversationId = nil
        MessageSocketManager.shared.activeConversationId = nil
    }

    public func dismissToast() {
        toastDismissTask?.cancel()
        toastDismissTask = nil
        currentToast = nil
    }

    public func markAllAsRead() async {
        do {
            _ = try await NotificationService.shared.markAllAsRead()
            NotificationCoordinator.shared.setInAppNotificationUnread(0)
        } catch {
            logger.error("Failed to mark all as read: \(error.localizedDescription)")
        }
    }

    public func reset() {
        dismissToast()
        activeConversationId = nil
        // Unread count cleared by NotificationCoordinator.reset() — do not
        // duplicate that write here or both paths will race.
    }

    // MARK: - Coordinator Mirror

    private func subscribeToCoordinator() {
        NotificationCoordinator.shared.$inAppNotificationUnread
            .receive(on: DispatchQueue.main)
            .assign(to: &$unreadCount)
    }

    // MARK: - Socket Subscriptions

    private func subscribeToSocketEvents() {
        let socket = MessageSocketManager.shared

        socket.notificationReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleNewNotification(event)
            }
            .store(in: &cancellables)

        socket.notificationRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleNotificationRead(event)
            }
            .store(in: &cancellables)

        socket.notificationDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleNotificationDeleted(event)
            }
            .store(in: &cancellables)

        // `notification:counts` is handled by NotificationCoordinator directly —
        // we used to duplicate the subscription here, but that race was the
        // source of the drift between the bell and the badge.
    }

    // MARK: - Event Handlers

    private func handleNewNotification(_ event: SocketNotificationEvent) {
        Logger.socket.info("[RT-DIAG] in-app notification received via SOCKET notification:new conv=\(event.conversationId ?? "none", privacy: .public) type=\(String(describing: event.notificationType), privacy: .public)")

        // Muting logic: suppress the in-app toast if the user is already
        // viewing the relevant content. Le contenu étant consommé en direct,
        // la notification ne doit pas rester non lue : on la marque lue côté
        // serveur (qui ré-émet `notification:counts`). On NE l'incrémente pas
        // localement (on sort avant `incrementInAppNotificationUnread`).
        if let convId = event.conversationId, convId == activeConversationId {
            Logger.socket.info("[RT-DIAG] in-app notification suppressed (conversation is active) conv=\(convId, privacy: .public)")
            let notificationId = event.id
            Task {
                try? await NotificationService.shared.markAsRead(notificationId: notificationId)
            }
            notificationMarkedRead.send(notificationId)
            return
        }

        if let postId = event.postId, postId == activePostId {
            Logger.socket.info("[RT-DIAG] in-app notification suppressed (post is active) postId=\(postId, privacy: .public)")
            return
        }

        // Keep FriendshipCache in sync with real-time friend request events
        updateFriendshipCacheIfNeeded(event)

        // The unread counter reflects what the *server* thinks — increment it
        // regardless of local prefs so the coordinator stays aligned with the
        // authoritative count. Local prefs only gate the TOAST surface.
        NotificationCoordinator.shared.incrementInAppNotificationUnread()
        newNotificationReceived.send(event)

        let prefs = UserPreferencesManager.shared.notification
        let focus = focusFilterProvider?() ?? .permissive
        let isDirect = event.isDirect
        if prefs.allowsNotification(
            type: event.notificationType,
            isDirectConversation: isDirect,
            focus: focus
        ) {
            Logger.socket.info("[RT-DIAG] in-app toast SHOWN conv=\(event.conversationId ?? "none", privacy: .public)")
            showToast(event)
        } else {
            Logger.socket.info("[RT-DIAG] in-app toast SUPPRESSED by prefs/focus conv=\(event.conversationId ?? "none", privacy: .public)")
        }
    }

    private func updateFriendshipCacheIfNeeded(_ event: SocketNotificationEvent) {
        let cacheChanged: Bool
        switch event.notificationType {
        case .friendRequest:
            guard let senderId = event.senderId,
                  let requestId = event.context?.friendRequestId else { return }
            FriendshipCache.shared.didReceiveRequest(from: senderId, requestId: requestId)
            cacheChanged = true
        case .friendAccepted:
            guard let accepterId = event.senderId else { return }
            FriendshipCache.shared.didAcceptRequest(from: accepterId)
            cacheChanged = true
        default:
            cacheChanged = false
        }
        // Real-time mutations from the gateway flip the in-memory FriendshipCache
        // but the persistent GRDB stores (friends list, received / sent requests)
        // would still serve `.fresh` data without the new state, masking the
        // event until the natural TTL elapses. Invalidate them so the next
        // `loadFriends()` / `loadReceived()` round-trips the gateway and writes
        // the freshly-mutated truth to SQLite. Fire-and-forget — the local
        // optimistic state in `FriendshipCache` already drives the UI.
        if cacheChanged {
            Task { await FriendshipCache.shared.invalidatePersistedFriendCaches() }
        }
    }

    private func handleNotificationRead(_ event: NotificationReadEvent) {
        NotificationCoordinator.shared.decrementInAppNotificationUnread()
        notificationMarkedRead.send(event.notificationId)
    }

    private func handleNotificationDeleted(_ event: NotificationDeletedEvent) {
        notificationWasDeleted.send(event.notificationId)
    }

    // MARK: - Toast

    private func showToast(_ event: SocketNotificationEvent) {
        toastDismissTask?.cancel()
        currentToast = event

        toastDismissTask = Task {
            try? await Task.sleep(nanoseconds: Self.toastDuration)
            guard !Task.isCancelled else { return }
            currentToast = nil
        }
    }
}
