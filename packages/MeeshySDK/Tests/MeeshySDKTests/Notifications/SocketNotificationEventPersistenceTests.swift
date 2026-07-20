import XCTest
@testable import MeeshySDK

/// Tests for `SocketNotificationEvent.toAPINotification(createdAt:)`, the mapping
/// that lets a real-time `notification:new` event be written into the durable
/// notifications cache so it survives a cold start / offline reopen.
final class SocketNotificationEventPersistenceTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func makeEvent(_ json: String) throws -> SocketNotificationEvent {
        try decoder.decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    func test_toAPINotification_mapsCoreFieldsAndActor() throws {
        let event = try makeEvent("""
        {
            "id": "n1", "userId": "u1", "type": "new_message", "priority": "high",
            "title": "Alice Dupont", "content": "Salut", "isRead": false,
            "actor": { "id": "a1", "username": "alice", "displayName": "Alice Dupont", "avatar": "https://cdn/a.jpg" },
            "context": { "conversationId": "c1", "conversationTitle": "Équipe", "conversationType": "group" }
        }
        """)

        let api = event.toAPINotification(createdAt: "2026-06-28T10:00:00.000Z")

        XCTAssertEqual(api.id, "n1")
        XCTAssertEqual(api.userId, "u1")
        XCTAssertEqual(api.type, "new_message")
        XCTAssertEqual(api.priority, "high")
        XCTAssertEqual(api.title, "Alice Dupont")
        XCTAssertEqual(api.content, "Salut")
        XCTAssertEqual(api.senderId, "a1")
        XCTAssertEqual(api.senderName, "Alice Dupont")
        XCTAssertEqual(api.senderAvatar, "https://cdn/a.jpg")
        XCTAssertEqual(api.context?.conversationId, "c1")
        XCTAssertEqual(api.context?.conversationTitle, "Équipe")
        XCTAssertFalse(api.isRead)
        XCTAssertEqual(api.createdAt, "2026-06-28T10:00:00.000Z")
    }

    func test_toAPINotification_isReadDefaultsToFalseWhenAbsent() throws {
        let event = try makeEvent("""
        { "id": "n2", "userId": "u1", "type": "friend_request", "content": "x" }
        """)

        let api = event.toAPINotification(createdAt: "2026-06-28T10:00:00.000Z")
        XCTAssertFalse(api.isRead)
    }

    func test_toAPINotification_dropsActorWhenIdMissing() throws {
        let event = try makeEvent("""
        {
            "id": "n3", "userId": "u1", "type": "system", "content": "x",
            "actor": { "username": "ghost" }
        }
        """)

        let api = event.toAPINotification(createdAt: "2026-06-28T10:00:00.000Z")
        XCTAssertNil(api.actor, "an actor without an id cannot satisfy NotificationActor's non-optional id")
    }

    func test_toAPINotification_resolvesPostIdFromMetadataFallback() throws {
        let event = try makeEvent("""
        {
            "id": "n4", "userId": "u1", "type": "post_reaction", "content": "x",
            "metadata": { "postId": "p99" }
        }
        """)

        let api = event.toAPINotification(createdAt: "2026-06-28T10:00:00.000Z")
        XCTAssertEqual(api.context?.postId, "p99")
    }
}
