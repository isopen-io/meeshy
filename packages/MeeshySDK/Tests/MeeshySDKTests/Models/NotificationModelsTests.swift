import XCTest
@testable import MeeshySDK

final class NotificationModelsTests: XCTestCase {

    // MARK: - MeeshyNotificationType

    func testNotificationTypeRawValues() {
        XCTAssertEqual(MeeshyNotificationType.newMessage.rawValue, "new_message")
        XCTAssertEqual(MeeshyNotificationType.contactRequest.rawValue, "contact_request")
        XCTAssertEqual(MeeshyNotificationType.postLike.rawValue, "post_like")
        XCTAssertEqual(MeeshyNotificationType.friendRequest.rawValue, "friend_request")
        XCTAssertEqual(MeeshyNotificationType.missedCall.rawValue, "missed_call")
        XCTAssertEqual(MeeshyNotificationType.securityAlert.rawValue, "security_alert")
        XCTAssertEqual(MeeshyNotificationType.system.rawValue, "system")
    }

    func testNotificationTypeLegacyRawValues() {
        XCTAssertEqual(MeeshyNotificationType.legacyNewMessage.rawValue, "NEW_MESSAGE")
        XCTAssertEqual(MeeshyNotificationType.legacyFriendRequest.rawValue, "FRIEND_REQUEST")
        XCTAssertEqual(MeeshyNotificationType.legacyPostLike.rawValue, "POST_LIKE")
    }

    func testNotificationTypeSystemIcon() {
        XCTAssertEqual(MeeshyNotificationType.newMessage.systemIcon, "bubble.left.fill")
        XCTAssertEqual(MeeshyNotificationType.friendRequest.systemIcon, "person.badge.plus")
        XCTAssertEqual(MeeshyNotificationType.postLike.systemIcon, "hand.thumbsup.fill")
        XCTAssertEqual(MeeshyNotificationType.missedCall.systemIcon, "phone.arrow.down.left")
        XCTAssertEqual(MeeshyNotificationType.achievementUnlocked.systemIcon, "trophy.fill")
        XCTAssertEqual(MeeshyNotificationType.securityAlert.systemIcon, "exclamationmark.triangle.fill")
        XCTAssertEqual(MeeshyNotificationType.system.systemIcon, "bell.fill")
    }

    func testNotificationTypeAccentHex() {
        XCTAssertEqual(MeeshyNotificationType.newMessage.accentHex, "3498DB")
        XCTAssertEqual(MeeshyNotificationType.messageReaction.accentHex, "FF6B6B")
        XCTAssertEqual(MeeshyNotificationType.friendRequest.accentHex, "4ECDC4")
        XCTAssertEqual(MeeshyNotificationType.missedCall.accentHex, "E91E63")
        XCTAssertEqual(MeeshyNotificationType.securityAlert.accentHex, "EF4444")
        XCTAssertEqual(MeeshyNotificationType.system.accentHex, "6366F1")
    }

    // MARK: - NotificationActor

    func testNotificationActorDecoding() throws {
        let json = """
        {"id":"abc123","username":"alice","displayName":"Alice W","avatar":"https://img.test/a.png"}
        """.data(using: .utf8)!

        let actor = try JSONDecoder().decode(NotificationActor.self, from: json)
        XCTAssertEqual(actor.id, "abc123")
        XCTAssertEqual(actor.username, "alice")
        XCTAssertEqual(actor.displayName, "Alice W")
        XCTAssertEqual(actor.avatar, "https://img.test/a.png")
    }

    func testNotificationActorDisplayedNameUsesDisplayName() throws {
        let json = """
        {"id":"1","username":"bob","displayName":"Bobby"}
        """.data(using: .utf8)!

        let actor = try JSONDecoder().decode(NotificationActor.self, from: json)
        XCTAssertEqual(actor.displayedName, "Bobby")
    }

    func testNotificationActorDisplayedNameFallsBackToUsername() throws {
        let json = """
        {"id":"1","username":"bob","displayName":null}
        """.data(using: .utf8)!

        let actor = try JSONDecoder().decode(NotificationActor.self, from: json)
        XCTAssertEqual(actor.displayedName, "bob")
    }

    // MARK: - NotificationContext

    func testNotificationContextDecoding() throws {
        let json = """
        {"conversationId":"conv1","messageId":"msg1","postId":"post1","friendRequestId":null}
        """.data(using: .utf8)!

        let context = try JSONDecoder().decode(NotificationContext.self, from: json)
        XCTAssertEqual(context.conversationId, "conv1")
        XCTAssertEqual(context.messageId, "msg1")
        XCTAssertEqual(context.postId, "post1")
        XCTAssertNil(context.friendRequestId)
        XCTAssertNil(context.callSessionId)
    }

    // MARK: - NotificationState

    func testNotificationStateDecoding() throws {
        let json = """
        {"isRead":true,"readAt":"2026-01-15T10:30:00.000Z","createdAt":"2026-01-15T09:00:00.000Z","expiresAt":null}
        """.data(using: .utf8)!

        let state = try JSONDecoder().decode(NotificationState.self, from: json)
        XCTAssertTrue(state.isRead)
        XCTAssertEqual(state.readAt, "2026-01-15T10:30:00.000Z")
        XCTAssertEqual(state.createdAt, "2026-01-15T09:00:00.000Z")
        XCTAssertNil(state.expiresAt)
    }

    // MARK: - APINotification

    func testAPINotificationDecodingFromFullJSON() throws {
        let json = """
        {
            "id": "notif1",
            "userId": "user1",
            "type": "new_message",
            "priority": "high",
            "content": "Hello!",
            "actor": {"id":"sender1","username":"alice","displayName":"Alice","avatar":null},
            "context": {"conversationId":"conv1","messageId":"msg1"},
            "metadata": {"messagePreview":"Hello!"},
            "state": {"isRead":false,"readAt":null,"createdAt":"2026-01-15T10:30:00.000Z","expiresAt":null},
            "delivery": {"emailSent":false,"pushSent":true}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertEqual(notification.id, "notif1")
        XCTAssertEqual(notification.userId, "user1")
        XCTAssertEqual(notification.type, "new_message")
        XCTAssertEqual(notification.priority, "high")
        XCTAssertEqual(notification.content, "Hello!")
        XCTAssertEqual(notification.actor?.username, "alice")
        XCTAssertEqual(notification.context?.conversationId, "conv1")
        XCTAssertFalse(notification.state.isRead)
    }

    func testAPINotificationComputedProperties() throws {
        let json = """
        {
            "id": "notif2",
            "userId": "user1",
            "type": "friend_request",
            "content": null,
            "actor": {"id":"s1","username":"bob","displayName":"Bob"},
            "state": {"isRead":true,"readAt":"2026-01-15T10:30:00.000Z","createdAt":"2026-01-15T09:00:00.000Z"}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertEqual(notification.notificationType, .friendRequest)
        XCTAssertTrue(notification.isRead)
        XCTAssertEqual(notification.senderId, "s1")
        XCTAssertEqual(notification.senderName, "Bob")
    }

    func testAPINotificationUnknownTypeFallsBackToSystem() throws {
        let json = """
        {
            "id": "notif3",
            "userId": "user1",
            "type": "unknown_type_xyz",
            "state": {"isRead":false,"createdAt":"2026-01-15T10:30:00.000Z"}
        }
        """.data(using: .utf8)!

        let notification = try JSONDecoder().decode(APINotification.self, from: json)
        XCTAssertEqual(notification.notificationType, .system)
    }

    // MARK: - RegisterDeviceTokenRequest

    func testRegisterDeviceTokenRequestEncoding() throws {
        let request = RegisterDeviceTokenRequest(token: "abc123")
        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["token"] as? String, "abc123")
        XCTAssertEqual(dict["platform"] as? String, "ios")
        XCTAssertEqual(dict["type"] as? String, "apns")
    }

    // MARK: - NotificationPagination

    func testNotificationPaginationDecoding() throws {
        let json = """
        {"total":42,"offset":10,"limit":20,"hasMore":true}
        """.data(using: .utf8)!

        let pagination = try JSONDecoder().decode(NotificationPagination.self, from: json)
        XCTAssertEqual(pagination.total, 42)
        XCTAssertEqual(pagination.offset, 10)
        XCTAssertEqual(pagination.limit, 20)
        XCTAssertTrue(pagination.hasMore)
    }
}
