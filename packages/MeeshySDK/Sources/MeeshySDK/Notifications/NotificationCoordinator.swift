import Foundation
import Combine
import UserNotifications
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "notification-coordinator")

/// Sink that receives notification data for home/lock-screen widgets.
///
/// Kept as a protocol so the SDK does not link against WidgetKit — the app target
/// is free to publish to an App Group container / reload timelines.
@MainActor
public protocol NotificationWidgetSink: AnyObject {
    /// Publish the full conversation list (already sorted by the caller) to the widget store.
    func publishConversations(_ conversations: [MeeshyConversation])

    /// Publish only a total unread count — used for notification-only refreshes.
    func publishUnreadCount(_ count: Int)

    /// Publish favorite contacts (pinned direct conversations) to the widget store.
    func publishFavoriteContacts(_ conversations: [MeeshyConversation])

    /// Reload widget timelines. Called whenever the coordinator broadcasts a change.
    func reloadTimelines()
}

/// Single source of truth that keeps the iOS badge, the home/lock widgets and the
/// in-app notification bell aligned.
///
/// The coordinator subscribes to socket events globally (not scoped to any view)
/// so counters stay correct even while the user is deep inside another screen.
///
/// Writes to the system badge go through a single choke point — no other class
/// should call `UNUserNotificationCenter.setBadgeCount` directly.
@MainActor
public final class NotificationCoordinator: ObservableObject {
    public static let shared = NotificationCoordinator()

    // MARK: - Published State

    /// Total of unread messages across every conversation. Drives the app icon badge
    /// and the widget's unread count.
    @Published public private(set) var conversationUnreadTotal: Int = 0

    /// Per-conversation unread counts (kept in sync via socket events).
    @Published public private(set) var conversationUnreadCounts: [String: Int] = [:]

    /// Count of unread in-app notifications (friend requests, mentions, reactions, …).
    /// Drives the in-app notification bell indicator only.
    @Published public private(set) var inAppNotificationUnread: Int = 0

    /// True once `start()` has wired up the socket subscriptions.
    @Published public private(set) var isRunning = false

    /// Value written to both the iOS badge and the widget unread counter.
    public var badgeTotal: Int { conversationUnreadTotal }

    // MARK: - Collaborators

    public weak var widgetSink: NotificationWidgetSink?
    private let badgeWriter: NotificationBadgeWriting
    private let appGroupDefaults: UserDefaults?

    private var cancellables = Set<AnyCancellable>()
    private var debounceTask: Task<Void, Never>?

    // MARK: - Init

    public init(
        badgeWriter: NotificationBadgeWriting = SystemNotificationBadgeWriter(),
        appGroupSuiteName: String = "group.me.meeshy.app"
    ) {
        self.badgeWriter = badgeWriter
        self.appGroupDefaults = UserDefaults(suiteName: appGroupSuiteName)
    }

    // MARK: - Lifecycle

    /// Wire up socket subscriptions. Idempotent — calling it more than once is a no-op.
    public func start() {
        guard !isRunning else { return }
        subscribeToSocketEvents()
        isRunning = true
        logger.info("NotificationCoordinator started")
    }

    /// Tear down state on logout. Clears badge and cached counts.
    public func reset() {
        cancellables.removeAll()
        debounceTask?.cancel()
        debounceTask = nil
        conversationUnreadCounts = [:]
        conversationUnreadTotal = 0
        inAppNotificationUnread = 0
        let writer = badgeWriter
        Task { await writer.setBadgeCount(0) }
        appGroupDefaults?.set(0, forKey: Self.unreadCountKey)
        widgetSink?.publishUnreadCount(0)
        widgetSink?.reloadTimelines()
        isRunning = false
        logger.info("NotificationCoordinator reset")
    }

    // MARK: - Public API

    /// Register the full conversation list, typically called from `ConversationListViewModel`
    /// whenever the cached list mutates.
    public func registerConversations(_ conversations: [MeeshyConversation]) {
        var counts: [String: Int] = [:]
        for c in conversations {
            counts[c.id] = c.unreadCount
        }
        conversationUnreadCounts = counts
        recomputeTotal()
        widgetSink?.publishConversations(conversations)
        widgetSink?.publishFavoriteContacts(conversations)
        scheduleSync()
    }

    /// Apply a single conversation unread-count update (from the
    /// `conversation:unread-updated` socket event).
    public func applyConversationUnread(conversationId: String, unreadCount: Int) {
        let clamped = max(unreadCount, 0)
        if conversationUnreadCounts[conversationId] == clamped { return }
        conversationUnreadCounts[conversationId] = clamped
        recomputeTotal()
        scheduleSync()
    }

    /// Mark a conversation as fully read locally — called when the user opens it.
    public func markConversationRead(_ conversationId: String) {
        guard let existing = conversationUnreadCounts[conversationId], existing > 0 else { return }
        conversationUnreadCounts[conversationId] = 0
        recomputeTotal()
        scheduleSync()
    }

    /// Apply the `notification:counts` event from the gateway — mirrors the API bell count.
    public func applyInAppNotificationCounts(total: Int, unread: Int) {
        inAppNotificationUnread = max(unread, 0)
    }

    /// Set the in-app notification unread count directly (e.g. after a REST refresh).
    public func setInAppNotificationUnread(_ count: Int) {
        inAppNotificationUnread = max(count, 0)
    }

    // MARK: - Private

    private func subscribeToSocketEvents() {
        let socket = MessageSocketManager.shared

        socket.unreadUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyConversationUnread(
                    conversationId: event.conversationId,
                    unreadCount: event.unreadCount
                )
            }
            .store(in: &cancellables)

        socket.notificationCounts
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyInAppNotificationCounts(total: event.total, unread: event.unread)
            }
            .store(in: &cancellables)
    }

    private func recomputeTotal() {
        let total = conversationUnreadCounts.values.reduce(0, +)
        if total != conversationUnreadTotal {
            conversationUnreadTotal = total
        }
    }

    /// Debounce badge + widget writes so rapid socket bursts don't hammer the system.
    private func scheduleSync() {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled, let self else { return }
            await self.syncNow()
        }
    }

    /// Immediately push badge + widget updates. Exposed for tests and scene-phase callbacks.
    public func syncNow() async {
        let count = badgeTotal
        await badgeWriter.setBadgeCount(count)
        appGroupDefaults?.set(count, forKey: Self.unreadCountKey)
        widgetSink?.publishUnreadCount(count)
        widgetSink?.reloadTimelines()
    }

    // MARK: - Constants

    static let unreadCountKey = "unread_count"
}

// MARK: - Badge Writer Abstraction

/// Abstracts `UNUserNotificationCenter.setBadgeCount` so tests can assert without
/// touching the system framework.
public protocol NotificationBadgeWriting: Sendable {
    func setBadgeCount(_ count: Int) async
}

public struct SystemNotificationBadgeWriter: NotificationBadgeWriting {
    public init() {}
    public func setBadgeCount(_ count: Int) async {
        try? await UNUserNotificationCenter.current().setBadgeCount(max(count, 0))
    }
}
