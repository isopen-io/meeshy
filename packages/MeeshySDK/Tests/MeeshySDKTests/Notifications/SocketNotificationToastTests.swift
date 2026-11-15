import XCTest
@testable import MeeshySDK

/// Ce qui IDENTIFIE l'auteur d'une bannière in-app
/// (`SocketNotificationEvent+Toast.swift`) : nom affiché, avatar avec ses deux
/// replis (expéditeur → groupe → initiales), et le nom canonique du groupe.
///
/// Ce que la bannière DIT — headline, corps, vignette, réaction — est tenu par
/// `NotificationBannerPresentationTests` : deux questions, deux suites.
final class SocketNotificationToastTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func makeEvent(_ json: String) throws -> SocketNotificationEvent {
        try decoder.decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    // MARK: - Nom du groupe (matière première du cadrage « X dans <groupe> »)

    func test_groupName_isTheConversationTitle() throws {
        let event = try makeEvent("""
        {
            "id": "n1", "userId": "u1", "type": "new_message",
            "content": "Salut tout le monde",
            "actor": { "id": "a1", "username": "alice", "displayName": "Alice Dupont", "avatar": "https://cdn/a.jpg" },
            "context": { "conversationId": "c1", "conversationTitle": "Équipe Tech", "conversationType": "group" }
        }
        """)

        XCTAssertEqual(event.actorDisplayName, "Alice Dupont")
        XCTAssertEqual(event.conversationGroupName, "Équipe Tech")
    }

    func test_groupName_isNilForADirectMessage() throws {
        let event = try makeEvent("""
        {
            "id": "n2", "userId": "u1", "type": "new_message",
            "content": "Coucou",
            "actor": { "id": "a1", "username": "bob", "displayName": "Bob" },
            "context": { "conversationId": "c2", "conversationTitle": "Bob", "conversationType": "direct" }
        }
        """)

        XCTAssertNil(event.conversationGroupName)
    }

    /// Un contenu social n'a pas de groupe — même quand la passerelle y met un
    /// titre de conversation par accident, ce n'est pas un cadrage « dans ».
    func test_groupName_isNilForASocialEvent() throws {
        let event = try makeEvent("""
        {
            "id": "n3", "userId": "u1", "type": "post_comment",
            "content": "Superbe photo",
            "actor": { "id": "a1", "displayName": "Dana" },
            "context": { "conversationTitle": "Équipe Tech", "conversationType": "group" }
        }
        """)

        XCTAssertNil(event.conversationGroupName)
    }

    // MARK: - Avatar fallback

    func test_avatar_usesSenderAvatarWhenPresent() throws {
        let event = try makeEvent("""
        {
            "id": "n11", "userId": "u1", "type": "new_message", "content": "hi",
            "actor": { "id": "a1", "displayName": "Alice", "avatar": "https://cdn/sender.jpg" },
            "context": { "conversationTitle": "Groupe", "conversationType": "group", "conversationAvatar": "https://cdn/group.jpg" }
        }
        """)

        XCTAssertEqual(event.toastAvatarURL, "https://cdn/sender.jpg")
        XCTAssertEqual(event.toastAvatarName, "Alice")
    }

    func test_avatar_fallsBackToGroupWhenSenderHasNone() throws {
        let event = try makeEvent("""
        {
            "id": "n12", "userId": "u1", "type": "new_message", "content": "hi",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": { "conversationTitle": "Groupe", "conversationType": "group", "conversationAvatar": "https://cdn/group.jpg" }
        }
        """)

        XCTAssertEqual(event.toastAvatarURL, "https://cdn/group.jpg")
        XCTAssertEqual(event.toastAvatarName, "Groupe")
    }

    func test_avatar_directMessageDoesNotUseGroupAvatar() throws {
        let event = try makeEvent("""
        {
            "id": "n13", "userId": "u1", "type": "new_message", "content": "hi",
            "actor": { "id": "a1", "displayName": "Bob" },
            "context": { "conversationTitle": "Bob", "conversationType": "direct", "conversationAvatar": "https://cdn/group.jpg" }
        }
        """)

        XCTAssertNil(event.toastAvatarURL)
        XCTAssertEqual(event.toastAvatarName, "Bob")
    }

    // MARK: - Replis

    func test_unknownActor_fallsBackToQuelquun() throws {
        let event = try makeEvent("""
        {
            "id": "n14", "userId": "u1", "type": "new_message", "content": "hi",
            "context": { "conversationType": "direct" }
        }
        """)

        XCTAssertEqual(event.actorDisplayName, "Quelqu'un")
    }
}
