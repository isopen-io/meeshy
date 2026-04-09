import Foundation
import Combine
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "notifications")

@MainActor
public final class NotificationManager: ObservableObject {
    public static let shared = NotificationManager()

    @Published public private(set) var unreadCount: Int = 0
    @Published public private(set) var currentToast: SocketNotificationEvent?
    @Published public private(set) var activeConversationId: String?

    private var cancellables = Set<AnyCancellable>()
    private var toastDismissTask: Task<Void, Never>?
    private static let toastDuration: UInt64 = 7_000_000_000
    private static let refreshDelay: UInt64 = 500_000_000

    private init() {
        subscribeToSocketNotifications()
    }

    // MARK: - Public API

    public func refreshUnreadCount() async {
        do {
            let count = try await NotificationService.shared.unreadCount()
            unreadCount = count
            await PushNotificationManager.shared.updateBadge(totalUnread: count)
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
            unreadCount = 0
            await PushNotificationManager.shared.resetBadge()
        } catch {
            logger.error("Failed to mark all as read: \(error.localizedDescription)")
        }
    }

    public func reset() {
        unreadCount = 0
        dismissToast()
        activeConversationId = nil
    }

    // MARK: - Private

    private func subscribeToSocketNotifications() {
        MessageSocketManager.shared.notificationReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleSocketNotification(event)
            }
            .store(in: &cancellables)
    }

    private func handleSocketNotification(_ event: SocketNotificationEvent) {
        if let convId = event.conversationId, convId == activeConversationId {
            return
        }

        unreadCount += 1
        showToast(event)
    }

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
