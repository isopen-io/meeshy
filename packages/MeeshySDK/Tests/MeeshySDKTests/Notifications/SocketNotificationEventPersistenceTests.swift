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

    /// La ligne insérée par le socket doit dire CE QUI est arrivé, comme celle
    /// que le REST posera à la prochaine synchro : sans le sous-titre, elle
    /// restait muette sur son type jusqu'au prochain rafraîchissement.
    func test_toAPINotification_carriesTheServerActionPhrase() throws {
        let event = try makeEvent("""
        {
            "id": "n1b", "userId": "u1", "type": "post_comment",
            "title": "Alice Dupont", "subtitle": "a commenté votre réel",
            "content": "Superbe montage !",
            "actor": { "id": "a1", "displayName": "Alice Dupont" }
        }
        """)

        let api = event.toAPINotification(createdAt: "2026-06-28T10:00:00.000Z")
        XCTAssertEqual(api.subtitle, "a commenté votre réel")
    }

    /// Revue N9 (#19104, ios-notifs-3) — la ligne rangée par le socket dit la date de publication du contenu lié et
    /// son expiration, comme celle que la relecture REST posera.
    func test_toAPINotification_carriesTheLinkedContentDates() throws {
        let event = try makeEvent("""
        {
            "id": "n7", "userId": "u1", "type": "story_reaction", "content": "a réagi à votre story",
            "context": { "postId": "p1", "postCreatedAt": "2026-11-01T08:00:00.000Z", "postExpiresAt": "2026-11-02T08:00:00.000Z" }
        }
        """)

        let api = event.toAPINotification(createdAt: "2026-11-01T09:00:00.000Z")

        XCTAssertEqual(api.context?.postCreatedAt, "2026-11-01T08:00:00.000Z")
        XCTAssertEqual(api.context?.postExpiresAt, "2026-11-02T08:00:00.000Z")
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


    // MARK: - État et métadonnées servis par le fil (#19104)

    /// La passerelle sert l'état de la ligne sous `state` (`formatNotification`),
    /// jamais à la racine : une notification réécrite après une édition déjà
    /// lue repartait non lue et datée de son arrivée.
    func test_toAPINotification_servesTheWireStateOfTheRow() throws {
        let event = try makeEvent("""
        {
            "id": "n-state", "userId": "u1", "type": "new_message", "content": "Salut",
            "state": { "isRead": true, "readAt": "2026-11-01T10:05:00.000Z", "createdAt": "2026-11-01T10:00:00.000Z" }
        }
        """)

        let api = event.toAPINotification(createdAt: "2026-11-17T12:00:00.000Z")

        XCTAssertEqual(event.resolvedIsRead, true)
        XCTAssertTrue(api.isRead)
        XCTAssertEqual(api.createdAt, "2026-11-01T10:00:00.000Z")
    }

    /// La ligne rangée par le socket garde le type de contenu et la communauté :
    /// sans eux, la cloche servie par le cache ouvrait un commentaire de réel
    /// en détail de post plat.
    func test_toAPINotification_keepsTheMetadataAndTheCommunity() throws {
        let event = try makeEvent("""
        {
            "id": "n-meta", "userId": "u1", "type": "post_comment", "content": "Superbe",
            "metadata": { "postType": "REEL", "postThumbnailUrl": "https://x/t.jpg" },
            "context": { "communityId": "c1" }
        }
        """)

        let api = event.toAPINotification(createdAt: "2026-11-17T12:00:00.000Z")

        XCTAssertEqual(api.metadata?.postType, "REEL")
        XCTAssertEqual(api.metadata?.postThumbnailUrl, "https://x/t.jpg")
        XCTAssertEqual(api.context?.communityId, "c1")
    }
}
