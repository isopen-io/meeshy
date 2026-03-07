import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - NotificationPayload Tests

final class NotificationPayloadTests: XCTestCase {

    // MARK: - Helpers

    private func makeUserInfo(
        type: String? = nil,
        conversationId: String? = nil,
        messageId: String? = nil,
        senderId: String? = nil,
        senderUsername: String? = nil,
        alertTitle: String? = nil,
        alertBody: String? = nil
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [:]
        if let type { info["type"] = type }
        if let conversationId { info["conversationId"] = conversationId }
        if let messageId { info["messageId"] = messageId }
        if let senderId { info["senderId"] = senderId }
        if let senderUsername { info["senderUsername"] = senderUsername }

        if alertTitle != nil || alertBody != nil {
            var alert: [String: Any] = [:]
            if let alertTitle { alert["title"] = alertTitle }
            if let alertBody { alert["body"] = alertBody }
            info["aps"] = ["alert": alert]
        }
        return info
    }

    // MARK: - Basic Parsing

    func test_init_fullPayload_parsesAllFields() {
        let userInfo = makeUserInfo(
            type: "new_message",
            conversationId: "conv123",
            messageId: "msg456",
            senderId: "user789",
            senderUsername: "atabeth",
            alertTitle: "New Message",
            alertBody: "Hello there!"
        )

        let payload = NotificationPayload(userInfo: userInfo)

        XCTAssertEqual(payload.type, "new_message")
        XCTAssertEqual(payload.conversationId, "conv123")
        XCTAssertEqual(payload.messageId, "msg456")
        XCTAssertEqual(payload.senderId, "user789")
        XCTAssertEqual(payload.senderUsername, "atabeth")
        XCTAssertEqual(payload.title, "New Message")
        XCTAssertEqual(payload.body, "Hello there!")
    }

    func test_init_emptyPayload_allFieldsNil() {
        let payload = NotificationPayload(userInfo: [:])

        XCTAssertNil(payload.type)
        XCTAssertNil(payload.conversationId)
        XCTAssertNil(payload.messageId)
        XCTAssertNil(payload.senderId)
        XCTAssertNil(payload.senderUsername)
        XCTAssertNil(payload.title)
        XCTAssertNil(payload.body)
    }

    func test_init_typeOnly_otherFieldsNil() {
        let userInfo = makeUserInfo(type: "friend_request")

        let payload = NotificationPayload(userInfo: userInfo)

        XCTAssertEqual(payload.type, "friend_request")
        XCTAssertNil(payload.conversationId)
        XCTAssertNil(payload.title)
    }

    func test_init_withApsAlert_parsesAlertFields() {
        let userInfo = makeUserInfo(
            alertTitle: "Meeshy",
            alertBody: "You have a new friend request"
        )

        let payload = NotificationPayload(userInfo: userInfo)

        XCTAssertEqual(payload.title, "Meeshy")
        XCTAssertEqual(payload.body, "You have a new friend request")
    }

    func test_init_withApsButNoAlert_titleAndBodyNil() {
        let userInfo: [AnyHashable: Any] = [
            "aps": ["badge": 5],
            "type": "badge_update"
        ]

        let payload = NotificationPayload(userInfo: userInfo)

        XCTAssertEqual(payload.type, "badge_update")
        XCTAssertNil(payload.title)
        XCTAssertNil(payload.body)
    }

    func test_init_messageNotification_parsesConversationAndMessage() {
        let userInfo = makeUserInfo(
            type: "new_message",
            conversationId: "60f7a1b2c3d4e5f6a7b8c9d0",
            messageId: "60f7a1b2c3d4e5f6a7b8c9d1",
            senderId: "60f7a1b2c3d4e5f6a7b8c9d2",
            senderUsername: "jcharlesnm"
        )

        let payload = NotificationPayload(userInfo: userInfo)

        XCTAssertEqual(payload.type, "new_message")
        XCTAssertEqual(payload.conversationId, "60f7a1b2c3d4e5f6a7b8c9d0")
        XCTAssertEqual(payload.messageId, "60f7a1b2c3d4e5f6a7b8c9d1")
        XCTAssertEqual(payload.senderId, "60f7a1b2c3d4e5f6a7b8c9d2")
        XCTAssertEqual(payload.senderUsername, "jcharlesnm")
    }

    // MARK: - Notification Type Scenarios

    func test_init_friendRequest_typeSet() {
        let payload = NotificationPayload(userInfo: makeUserInfo(type: "friend_request", senderId: "u1"))

        XCTAssertEqual(payload.type, "friend_request")
        XCTAssertEqual(payload.senderId, "u1")
        XCTAssertNil(payload.conversationId)
    }

    func test_init_achievementUnlocked_typeSet() {
        let payload = NotificationPayload(userInfo: makeUserInfo(type: "achievement_unlocked"))

        XCTAssertEqual(payload.type, "achievement_unlocked")
    }

    func test_init_contactAccepted_typeSet() {
        let payload = NotificationPayload(userInfo: makeUserInfo(
            type: "contact_accepted",
            senderId: "u2",
            senderUsername: "alice"
        ))

        XCTAssertEqual(payload.type, "contact_accepted")
        XCTAssertEqual(payload.senderId, "u2")
        XCTAssertEqual(payload.senderUsername, "alice")
    }
}

// MARK: - MeeshyNotificationType Tests (push navigation routing)

final class PushNavigationRoutingTests: XCTestCase {

    func test_friendRequest_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_request"), .friendRequest)
    }

    func test_friendAccepted_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "friend_accepted"), .friendAccepted)
    }

    func test_contactRequest_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "contact_request"), .contactRequest)
    }

    func test_contactAccepted_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "contact_accepted"), .contactAccepted)
    }

    func test_achievementUnlocked_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "achievement_unlocked"), .achievementUnlocked)
    }

    func test_newMessage_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "new_message"), .newMessage)
    }

    func test_unknown_rawValue_returnsNil() {
        XCTAssertNil(MeeshyNotificationType(rawValue: "non_existent_type"))
    }

    // MARK: - Legacy types

    func test_legacyFriendRequest_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "FRIEND_REQUEST"), .legacyFriendRequest)
    }

    func test_legacyFriendAccepted_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "FRIEND_ACCEPTED"), .legacyFriendAccepted)
    }

    func test_legacyAchievementUnlocked_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "ACHIEVEMENT_UNLOCKED"), .legacyAchievementUnlocked)
    }

    func test_legacyAffiliateSignup_rawValue() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "AFFILIATE_SIGNUP"), .legacyAffiliateSignup)
    }
}
