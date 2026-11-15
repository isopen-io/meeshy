import Foundation
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class MockNotificationFeed: NotificationFeedProviding {
    nonisolated deinit {}

    var unreadCount = 0
    var cached: CacheResult<[APINotification]> = .empty
    var markAllResult = true
    var deleteResult = true

    let unreadSubject = PassthroughSubject<Int, Never>()
    let arrivalSubject = PassthroughSubject<Void, Never>()
    let markedReadSubject = PassthroughSubject<String, Never>()
    let conversationReadSubject = PassthroughSubject<String, Never>()
    let postReadSubject = PassthroughSubject<String, Never>()
    let typesReadSubject = PassthroughSubject<[String], Never>()
    let allReadSubject = PassthroughSubject<Void, Never>()
    let rolledBackSubject = PassthroughSubject<String, Never>()
    let deletedSubject = PassthroughSubject<String, Never>()

    private(set) var cachedFeedCallCount = 0
    private(set) var storedFeeds: [[APINotification]] = []
    private(set) var refreshUnreadCountCallCount = 0
    private(set) var markedReadIds: [String] = []

    var unreadCountChanges: AnyPublisher<Int, Never> { unreadSubject.eraseToAnyPublisher() }
    var newNotificationReceived: AnyPublisher<Void, Never> { arrivalSubject.eraseToAnyPublisher() }
    var notificationMarkedRead: AnyPublisher<String, Never> { markedReadSubject.eraseToAnyPublisher() }
    var conversationNotificationsRead: AnyPublisher<String, Never> { conversationReadSubject.eraseToAnyPublisher() }
    var postNotificationsRead: AnyPublisher<String, Never> { postReadSubject.eraseToAnyPublisher() }
    var typeNotificationsRead: AnyPublisher<[String], Never> { typesReadSubject.eraseToAnyPublisher() }
    var allNotificationsRead: AnyPublisher<Void, Never> { allReadSubject.eraseToAnyPublisher() }
    var notificationReadRolledBack: AnyPublisher<String, Never> { rolledBackSubject.eraseToAnyPublisher() }
    var notificationWasDeleted: AnyPublisher<String, Never> { deletedSubject.eraseToAnyPublisher() }

    func cachedFeed() async -> CacheResult<[APINotification]> {
        cachedFeedCallCount += 1
        return cached
    }

    func storeFeed(_ notifications: [APINotification]) async throws {
        storedFeeds.append(notifications)
    }

    func refreshUnreadCount() async {
        refreshUnreadCountCallCount += 1
    }

    func markRead(notificationId: String) async {
        markedReadIds.append(notificationId)
    }

    func markAllAsRead() async -> Bool { markAllResult }

    func delete(notificationId: String) async -> Bool { deleteResult }
}

final class MockNotificationListService: NotificationServiceProviding, @unchecked Sendable {
    struct Appel: Equatable {
        let offset: Int?
        let cursor: String?
        let limit: Int
        let unreadOnly: Bool
        let types: [String]
        let hideReadTypes: [String]
    }

    var pages: [NotificationListResponse] = []
    private(set) var appels: [Appel] = []

    func list(
        offset: Int?,
        cursor: String?,
        limit: Int,
        unreadOnly: Bool,
        types: [String],
        hideReadTypes: [String]
    ) async throws -> NotificationListResponse {
        appels.append(Appel(
            offset: offset, cursor: cursor, limit: limit, unreadOnly: unreadOnly,
            types: types, hideReadTypes: hideReadTypes
        ))
        guard !pages.isEmpty else { throw URLError(.badServerResponse) }
        return pages.removeFirst()
    }

    func unreadCount() async throws -> Int { 0 }
    func markAsRead(notificationId: String) async throws {}
}

enum NotificationStubs {
    static func notification(_ id: String, type: String = "message", isRead: Bool = false) -> APINotification {
        APINotification(
            id: id, userId: "u1", type: type, priority: nil,
            content: "n", actor: nil, context: nil, metadata: nil,
            state: NotificationState(isRead: isRead, readAt: nil, createdAt: "2026-09-30T00:00:00.000Z", expiresAt: nil),
            delivery: nil
        )
    }

    static func page(_ ids: [String], type: String = "message", hasMore: Bool = false, nextCursor: String? = nil) -> NotificationListResponse {
        let rows = ids.map { notification($0, type: type) }
        let rowsJSON = (try? JSONEncoder().encode(rows)).map { String(decoding: $0, as: UTF8.self) } ?? "[]"
        let cursor = nextCursor.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {"success":true,"data":\(rowsJSON),"pagination":{"limit":30,"hasMore":\(hasMore),"nextCursor":\(cursor)},"unreadCount":null}
        """)
    }
}
