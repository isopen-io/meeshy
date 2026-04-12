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
public final class NotificationManager: ObservableObject {
    public static let shared = NotificationManager()

    /// Mirrors `NotificationCoordinator.inAppNotificationUnread`. Kept as a
    /// `@Published` convenience so legacy SwiftUI views that observe
    /// `NotificationManager.shared` continue to refresh without changes.
    @Published public private(set) var unreadCount: Int = 0

    @Published public private(set) var currentToast: SocketNotificationEvent?
    @Published public private(set) var activeConversationId: String?

    public let newNotificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    public let notificationMarkedRead = PassthroughSubject<String, Never>()
    public let notificationWasDeleted = PassthroughSubject<String, Never>()

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

        Task {
            try? await Task.sleep(nanoseconds: Self.refreshDelay)
            guard !Task.isCancelled else { return }
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
        if let convId = event.conversationId, convId == activeConversationId {
            return
        }

        NotificationCoordinator.shared.incrementInAppNotificationUnread()
        showToast(event)
        newNotificationReceived.send(event)
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
