import XCTest
@testable import MeeshySDK

/// Tests for the in-app toast presentation helpers on `SocketNotificationEvent`
/// (`SocketNotificationEvent+Toast.swift`). Verifies that:
///   * group messages render sender = title, group = subtitle, message = body
///   * direct messages have no subtitle
///   * social / interaction events render a precise action phrase
///   * the avatar falls back from sender → group → initials
final class SocketNotificationToastTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func makeEvent(_ json: String) throws -> SocketNotificationEvent {
        try decoder.decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    // MARK: - Group message: sender = title, group = subtitle

    func test_groupMessage_titleIsSender_subtitleIsGroup_bodyIsContent() throws {
        let event = try makeEvent("""
        {
            "id": "n1", "userId": "u1", "type": "new_message",
            "content": "Salut tout le monde",
            "actor": { "id": "a1", "username": "alice", "displayName": "Alice Dupont", "avatar": "https://cdn/a.jpg" },
            "context": { "conversationId": "c1", "conversationTitle": "Équipe Tech", "conversationType": "group" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Alice Dupont")
        XCTAssertEqual(event.toastSubtitle, "Équipe Tech")
        XCTAssertEqual(event.toastBody, "Salut tout le monde")
    }

    func test_directMessage_hasNoSubtitle() throws {
        let event = try makeEvent("""
        {
            "id": "n2", "userId": "u1", "type": "new_message",
            "content": "Coucou",
            "actor": { "id": "a1", "username": "bob", "displayName": "Bob" },
            "context": { "conversationId": "c2", "conversationTitle": "Bob", "conversationType": "direct" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Bob")
        XCTAssertNil(event.toastSubtitle)
        XCTAssertEqual(event.toastBody, "Coucou")
    }

    func test_groupMessage_withAttachment_bodyPrefixesLabel() throws {
        let event = try makeEvent("""
        {
            "id": "n3", "userId": "u1", "type": "new_message",
            "content": "",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": { "conversationTitle": "Photos", "conversationType": "group" },
            "metadata": { "attachments": { "count": 1, "firstType": "image" } }
        }
        """)

        XCTAssertEqual(event.toastSubtitle, "Photos")
        XCTAssertEqual(event.toastBody, "\u{1F4F7} Photo")
    }

    // MARK: - Precise action phrases

    func test_commentReply_isPrecise() throws {
        let event = try makeEvent("""
        {
            "id": "n4", "userId": "u1", "type": "comment_reply",
            "content": "",
            "actor": { "id": "a1", "displayName": "Charlie" },
            "context": { "postId": "p1", "commentId": "cm1" },
            "metadata": { "commentPreview": "Bien vu !" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Charlie a répondu à votre commentaire")
        XCTAssertEqual(event.toastBody, "Bien vu !")
        XCTAssertNil(event.toastSubtitle)
    }

    func test_postComment_isPrecise() throws {
        let event = try makeEvent("""
        {
            "id": "n5", "userId": "u1", "type": "post_comment",
            "content": "",
            "actor": { "id": "a1", "displayName": "Dana" },
            "metadata": { "commentPreview": "Superbe photo" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Dana a commenté votre publication")
        XCTAssertEqual(event.toastBody, "Superbe photo")
    }

    func test_storyComment_isPrecise() throws {
        let event = try makeEvent("""
        {
            "id": "n6", "userId": "u1", "type": "story_new_comment",
            "content": "",
            "actor": { "id": "a1", "displayName": "Eve" },
            "metadata": { "commentPreview": "Magnifique" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Eve a commenté votre story")
        XCTAssertEqual(event.toastBody, "Magnifique")
    }

    func test_statusReaction_usesStatusLabelAndEmoji() throws {
        let event = try makeEvent("""
        {
            "id": "n7", "userId": "u1", "type": "status_reaction",
            "content": "",
            "actor": { "id": "a1", "displayName": "Frank" },
            "metadata": { "emoji": "\u{2764}\u{FE0F}", "postType": "STATUS" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Frank a réagi \u{2764}\u{FE0F} à votre statut")
    }

    func test_messageReaction_isPrecise() throws {
        let event = try makeEvent("""
        {
            "id": "n8", "userId": "u1", "type": "message_reaction",
            "content": "",
            "actor": { "id": "a1", "displayName": "Grace" },
            "metadata": { "emoji": "\u{1F525}", "commentPreview": "mon message" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Grace a réagi \u{1F525} à votre message")
        XCTAssertEqual(event.toastBody, "mon message")
    }

    func test_postRepost_isPrecise() throws {
        let event = try makeEvent("""
        {
            "id": "n9", "userId": "u1", "type": "post_repost",
            "content": "",
            "actor": { "id": "a1", "displayName": "Heidi" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Heidi a repartagé votre publication")
        XCTAssertNil(event.toastBody)
    }

    func test_friendNewStory_isPrecise() throws {
        let event = try makeEvent("""
        {
            "id": "n10", "userId": "u1", "type": "friend_new_story",
            "content": "",
            "actor": { "id": "a1", "displayName": "Ivan" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Ivan a publié une nouvelle story")
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

    // MARK: - Fallbacks

    func test_unknownActor_fallsBackToQuelquun() throws {
        let event = try makeEvent("""
        {
            "id": "n14", "userId": "u1", "type": "new_message", "content": "hi",
            "context": { "conversationType": "direct" }
        }
        """)

        XCTAssertEqual(event.toastTitle, "Quelqu'un")
    }
}
