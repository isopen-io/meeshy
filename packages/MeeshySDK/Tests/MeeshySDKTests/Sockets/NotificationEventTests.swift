import XCTest
@testable import MeeshySDK

/// Point 52: NotificationCountsEvent, NotificationReadEvent, NotificationDeletedEvent,
///           and SocketNotificationEvent edge cases (nested actor/context/metadata format)
final class NotificationEventTests: XCTestCase {

    private let decoder = JSONDecoder()

    // MARK: - NotificationCountsEvent

    func test_notificationCountsEvent_allFields() throws {
        let json = """
        {
            "total": 42,
            "unread": 7,
            "byType": {
                "new_message": 3,
                "friend_request": 2,
                "post_like": 2
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationCountsEvent.self, from: json)
        XCTAssertEqual(event.total, 42)
        XCTAssertEqual(event.unread, 7)
        XCTAssertEqual(event.byType?["new_message"], 3)
        XCTAssertEqual(event.byType?["friend_request"], 2)
        XCTAssertEqual(event.byType?["post_like"], 2)
    }

    func test_notificationCountsEvent_withNilByType() throws {
        let json = """
        {"total": 0, "unread": 0}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationCountsEvent.self, from: json)
        XCTAssertEqual(event.total, 0)
        XCTAssertEqual(event.unread, 0)
        XCTAssertNil(event.byType)
    }

    func test_notificationCountsEvent_emptyByType() throws {
        let json = """
        {"total": 5, "unread": 1, "byType": {}}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationCountsEvent.self, from: json)
        XCTAssertEqual(event.byType?.count, 0)
    }

    func test_notificationCountsEvent_largeNumbers() throws {
        let json = """
        {"total": 999999, "unread": 500000, "byType": {"new_message": 400000}}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationCountsEvent.self, from: json)
        XCTAssertEqual(event.total, 999999)
        XCTAssertEqual(event.unread, 500000)
    }

    // MARK: - NotificationReadEvent

    func test_notificationReadEvent_decoding() throws {
        let json = """
        {"notificationId": "notif-abc-123"}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationReadEvent.self, from: json)
        XCTAssertEqual(event.notificationId, "notif-abc-123")
    }

    func test_notificationReadEvent_mongoId() throws {
        let json = """
        {"notificationId": "65f1a2b3c4d5e6f7a8b9c0d1"}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationReadEvent.self, from: json)
        XCTAssertEqual(event.notificationId, "65f1a2b3c4d5e6f7a8b9c0d1")
    }

    // MARK: - NotificationDeletedEvent

    func test_notificationDeletedEvent_decoding() throws {
        let json = """
        {"notificationId": "notif-xyz-789"}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationDeletedEvent.self, from: json)
        XCTAssertEqual(event.notificationId, "notif-xyz-789")
    }

    // MARK: - SocketNotificationEvent: nested gateway format (actor/context/metadata)

    func test_socketNotificationEvent_gatewayFormat_friendRequest() throws {
        let json = """
        {
            "id": "notif1",
            "userId": "u1",
            "type": "friend_request",
            "content": "alice veut se connecter",
            "actor": {
                "id": "actor1",
                "username": "alice",
                "displayName": "Alice Dupont",
                "avatar": "https://cdn.meeshy.me/a.jpg"
            },
            "context": {
                "friendRequestId": "fr123"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.id, "notif1")
        XCTAssertEqual(event.type, "friend_request")
        XCTAssertEqual(event.notificationType, .friendRequest)
        XCTAssertEqual(event.senderUsername, "alice")
        XCTAssertEqual(event.senderDisplayName, "Alice Dupont")
        XCTAssertEqual(event.senderAvatar, "https://cdn.meeshy.me/a.jpg")
        XCTAssertEqual(event.senderId, "actor1")
        XCTAssertNil(event.conversationId)
        XCTAssertNil(event.messageId)
    }

    func test_socketNotificationEvent_gatewayFormat_postLike() throws {
        let json = """
        {
            "id": "notif2",
            "userId": "u2",
            "type": "post_like",
            "content": "bob a aime votre publication",
            "actor": {
                "id": "actor2",
                "username": "bob"
            },
            "context": {
                "postId": "post123"
            },
            "metadata": {
                "emoji": "\u{2764}\u{FE0F}",
                "postType": "POST"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.notificationType, .postLike)
        XCTAssertEqual(event.postId, "post123")
        XCTAssertEqual(event.postType, "POST")
        XCTAssertEqual(event.senderId, "actor2")
        XCTAssertNil(event.senderDisplayName)
    }

    func test_socketNotificationEvent_gatewayFormat_noActorNoContext() throws {
        let json = """
        {
            "id": "notif3",
            "userId": "u3",
            "type": "system",
            "content": "Maintenance scheduled"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.notificationType, .system)
        XCTAssertNil(event.actor)
        XCTAssertNil(event.context)
        XCTAssertNil(event.metadata)
        XCTAssertNil(event.senderId)
        XCTAssertNil(event.senderUsername)
        XCTAssertNil(event.conversationId)
        XCTAssertNil(event.messageId)
        XCTAssertNil(event.postId)
        XCTAssertNil(event.messagePreview)
    }

    func test_socketNotificationEvent_unknownType_fallsBackToSystem() throws {
        let json = """
        {
            "id": "notif4",
            "userId": "u4",
            "type": "some_future_type",
            "content": "Unknown notification"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.type, "some_future_type")
        XCTAssertEqual(event.notificationType, .system)
    }

    func test_socketNotificationEvent_postId_fromMetadataFallback() throws {
        let json = """
        {
            "id": "notif5",
            "userId": "u5",
            "type": "post_comment",
            "content": "Nouveau commentaire",
            "metadata": {
                "postId": "post-from-metadata",
                "commentPreview": "Great post!"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.postId, "post-from-metadata")
        XCTAssertEqual(event.messagePreview, "Great post!")
    }

    // MARK: - ConversationOnlineStatsEvent

    func test_conversationOnlineStatsEvent_decodingWithUsers() throws {
        let isoDecoder: JSONDecoder = {
            let d = JSONDecoder()
            d.dateDecodingStrategy = .custom { decoder in
                let container = try decoder.singleValueContainer()
                let dateStr = try container.decode(String.self)
                let iso = ISO8601DateFormatter()
                iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let date = iso.date(from: dateStr) { return date }
                iso.formatOptions = [.withInternetDateTime]
                if let date = iso.date(from: dateStr) { return date }
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
            }
            return d
        }()

        let json = """
        {
            "conversationId": "conv1",
            "onlineUsers": [
                {"id": "u1", "username": "alice", "firstName": "Alice", "lastName": "Dupont"},
                {"id": "u2", "username": "bob"}
            ],
            "updatedAt": "2026-04-09T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try isoDecoder.decode(ConversationOnlineStatsEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.onlineUsers.count, 2)
        XCTAssertEqual(event.onlineUsers[0].id, "u1")
        XCTAssertEqual(event.onlineUsers[0].firstName, "Alice")
        XCTAssertEqual(event.onlineUsers[0].lastName, "Dupont")
        XCTAssertEqual(event.onlineUsers[1].id, "u2")
        XCTAssertNil(event.onlineUsers[1].firstName)
        XCTAssertNil(event.onlineUsers[1].lastName)
        XCTAssertNotNil(event.updatedAt)
    }

    func test_conversationOnlineStatsEvent_emptyUsers() throws {
        let json = """
        {
            "conversationId": "conv2",
            "onlineUsers": []
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationOnlineStatsEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv2")
        XCTAssertTrue(event.onlineUsers.isEmpty)
        XCTAssertNil(event.updatedAt)
    }
}
