import Combine
import MeeshySDK

@MainActor
protocol NotificationFeedProviding: AnyObject {
    var unreadCount: Int { get }
    var unreadCountChanges: AnyPublisher<Int, Never> { get }
    var newNotificationReceived: AnyPublisher<Void, Never> { get }
    var notificationMarkedRead: AnyPublisher<String, Never> { get }
    var conversationNotificationsRead: AnyPublisher<String, Never> { get }
    var postNotificationsRead: AnyPublisher<String, Never> { get }
    var typeNotificationsRead: AnyPublisher<[String], Never> { get }
    var allNotificationsRead: AnyPublisher<Void, Never> { get }
    var notificationReadRolledBack: AnyPublisher<String, Never> { get }
    var notificationWasDeleted: AnyPublisher<String, Never> { get }
    var notificationArrivedQuietly: AnyPublisher<APINotification, Never> { get }
    var readNotificationsPurged: AnyPublisher<Void, Never> { get }
    /// La liste servie vient d'être relue (premier plan, reconnexion, trou de séquence).
    var resynced: AnyPublisher<Void, Never> { get }
    var friendRequestNotificationsRead: AnyPublisher<String, Never> { get }

    func cachedFeed() async -> CacheResult<[APINotification]>
    /// Ce que le disque tient, quel que soit son âge : `.expired` dit « revalide »,
    /// jamais « il n'y a rien ».
    func cachedFeedIgnoringExpiry() async -> [APINotification]
    func storeFeed(_ notifications: [APINotification]) async throws
    func refreshUnreadCount() async
    func markRead(notificationId: String) async
    func markAllAsRead() async -> Bool
    func delete(notificationId: String) async -> Bool
}

@MainActor
final class LiveNotificationFeed: NotificationFeedProviding {
    nonisolated deinit {}

    private static let persistedCacheKey = "all"

    private var manager: NotificationToastManager { NotificationToastManager.shared }

    var unreadCount: Int { manager.unreadCount }
    var unreadCountChanges: AnyPublisher<Int, Never> { manager.$unreadCount.eraseToAnyPublisher() }
    var newNotificationReceived: AnyPublisher<Void, Never> {
        manager.newNotificationReceived.map { _ in () }.eraseToAnyPublisher()
    }
    var notificationMarkedRead: AnyPublisher<String, Never> { manager.notificationMarkedRead.eraseToAnyPublisher() }
    var conversationNotificationsRead: AnyPublisher<String, Never> { manager.conversationNotificationsRead.eraseToAnyPublisher() }
    var postNotificationsRead: AnyPublisher<String, Never> { manager.postNotificationsRead.eraseToAnyPublisher() }
    var typeNotificationsRead: AnyPublisher<[String], Never> { manager.typeNotificationsRead.eraseToAnyPublisher() }
    var allNotificationsRead: AnyPublisher<Void, Never> { manager.allNotificationsRead.eraseToAnyPublisher() }
    var notificationReadRolledBack: AnyPublisher<String, Never> { manager.notificationReadRolledBack.eraseToAnyPublisher() }
    var notificationWasDeleted: AnyPublisher<String, Never> { manager.notificationWasDeleted.eraseToAnyPublisher() }
    var notificationArrivedQuietly: AnyPublisher<APINotification, Never> { manager.notificationArrivedQuietly.eraseToAnyPublisher() }
    var readNotificationsPurged: AnyPublisher<Void, Never> { manager.readNotificationsPurged.eraseToAnyPublisher() }
    var resynced: AnyPublisher<Void, Never> { NotificationGapResyncCoordinator.shared.resynced.eraseToAnyPublisher() }
    var friendRequestNotificationsRead: AnyPublisher<String, Never> { manager.friendRequestNotificationsRead.eraseToAnyPublisher() }

    func cachedFeed() async -> CacheResult<[APINotification]> {
        await CacheCoordinator.shared.notifications.load(for: Self.persistedCacheKey)
    }

    func cachedFeedIgnoringExpiry() async -> [APINotification] {
        await CacheCoordinator.shared.notifications.loadIgnoringExpiry(for: Self.persistedCacheKey)?.items ?? []
    }

    func storeFeed(_ notifications: [APINotification]) async throws {
        try await CacheCoordinator.shared.notifications.save(notifications, for: Self.persistedCacheKey)
    }

    func refreshUnreadCount() async {
        await manager.refreshUnreadCount()
    }

    func markRead(notificationId: String) async {
        _ = await manager.markRead(notificationId: notificationId)
    }

    func markAllAsRead() async -> Bool {
        await manager.markAllAsRead()
    }

    func delete(notificationId: String) async -> Bool {
        await manager.delete(notificationId: notificationId)
    }
}
