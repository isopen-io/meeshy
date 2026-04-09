import XCTest
@testable import MeeshySDK

/// Additional message socket event struct decoding tests for types not yet covered.
/// Covers: ReactionSyncEvent, SystemMessageEvent, AttachmentStatusEvent, MentionCreatedEvent,
///         ConversationParticipationEvent, ParticipantRoleUpdatedEvent, ConversationUpdatedEvent,
///         UserPreferencesUpdatedEvent, ConversationStatsEvent, ParticipantLeftEvent,
///         ParticipantBannedEvent, ParticipantUnbannedEvent
final class MessageSocketMiscEventTests: XCTestCase {

    private let decoder = JSONDecoder()

    // MARK: - ReactionSyncEvent

    func test_reactionSyncEvent_decodingWithReactions() throws {
        let json = """
        {
            "messageId": "msg1",
            "reactions": [
                {"emoji": "\u{1F44D}", "count": 3, "participantIds": ["p1", "p2", "p3"], "hasCurrentUser": true},
                {"emoji": "\u{2764}\u{FE0F}", "count": 1, "participantIds": ["p1"], "hasCurrentUser": false}
            ],
            "totalCount": 4,
            "userReactions": ["\u{1F44D}"]
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ReactionSyncEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertEqual(event.reactions.count, 2)
        XCTAssertEqual(event.reactions[0].emoji, "\u{1F44D}")
        XCTAssertEqual(event.reactions[0].count, 3)
        XCTAssertEqual(event.reactions[0].hasCurrentUser, true)
        XCTAssertEqual(event.totalCount, 4)
        XCTAssertEqual(event.userReactions, ["\u{1F44D}"])
    }

    func test_reactionSyncEvent_emptyReactions() throws {
        let json = """
        {"messageId": "msg2", "reactions": []}
        """.data(using: .utf8)!

        let event = try decoder.decode(ReactionSyncEvent.self, from: json)
        XCTAssertTrue(event.reactions.isEmpty)
        XCTAssertNil(event.totalCount)
        XCTAssertNil(event.userReactions)
    }

    // MARK: - SystemMessageEvent

    func test_systemMessageEvent_decoding() throws {
        let json = """
        {"type": "user_joined", "content": "Alice joined the conversation"}
        """.data(using: .utf8)!

        let event = try decoder.decode(SystemMessageEvent.self, from: json)
        XCTAssertEqual(event.type, "user_joined")
        XCTAssertEqual(event.content, "Alice joined the conversation")
    }

    // MARK: - AttachmentStatusEvent

    func test_attachmentStatusEvent_decoding() throws {
        let json = """
        {"attachmentId": "att1", "status": "uploaded"}
        """.data(using: .utf8)!

        let event = try decoder.decode(AttachmentStatusEvent.self, from: json)
        XCTAssertEqual(event.attachmentId, "att1")
        XCTAssertEqual(event.status, "uploaded")
    }

    func test_attachmentStatusEvent_processingStatus() throws {
        let json = """
        {"attachmentId": "att2", "status": "processing"}
        """.data(using: .utf8)!

        let event = try decoder.decode(AttachmentStatusEvent.self, from: json)
        XCTAssertEqual(event.status, "processing")
    }

    // MARK: - MentionCreatedEvent

    func test_mentionCreatedEvent_allFields() throws {
        let json = """
        {
            "messageId": "msg1",
            "conversationId": "conv1",
            "senderId": "u1",
            "mentionedUserId": "u2",
            "mentionedParticipantId": "p2",
            "content": "Hey @bob check this out",
            "timestamp": "2026-04-09T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(MentionCreatedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.senderId, "u1")
        XCTAssertEqual(event.mentionedUserId, "u2")
        XCTAssertEqual(event.mentionedParticipantId, "p2")
        XCTAssertEqual(event.content, "Hey @bob check this out")
        XCTAssertEqual(event.timestamp, "2026-04-09T10:00:00.000Z")
    }

    func test_mentionCreatedEvent_minimal() throws {
        let json = """
        {"messageId": "msg2", "conversationId": "conv2"}
        """.data(using: .utf8)!

        let event = try decoder.decode(MentionCreatedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg2")
        XCTAssertNil(event.senderId)
        XCTAssertNil(event.mentionedUserId)
        XCTAssertNil(event.mentionedParticipantId)
        XCTAssertNil(event.content)
        XCTAssertNil(event.timestamp)
    }

    // MARK: - ConversationParticipationEvent

    func test_conversationParticipationEvent_decoding() throws {
        let json = """
        {"conversationId": "conv1", "userId": "u1"}
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationParticipationEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.userId, "u1")
    }

    // MARK: - ParticipantRoleUpdatedEvent

    func test_participantRoleUpdatedEvent_decoding() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "newRole": "MODERATOR",
            "updatedBy": "u2",
            "participant": {
                "id": "p1",
                "role": "MODERATOR",
                "displayName": "Alice",
                "userId": "u1"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantRoleUpdatedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.newRole, "MODERATOR")
        XCTAssertEqual(event.updatedBy, "u2")
        XCTAssertEqual(event.participant.id, "p1")
        XCTAssertEqual(event.participant.role, "MODERATOR")
        XCTAssertEqual(event.participant.displayName, "Alice")
        XCTAssertEqual(event.participant.userId, "u1")
    }

    func test_participantRoleUpdatedEvent_nilUserId() throws {
        let json = """
        {
            "conversationId": "conv2",
            "userId": "u3",
            "newRole": "ADMIN",
            "updatedBy": "u4",
            "participant": {
                "id": "p2",
                "role": "ADMIN",
                "displayName": "Bob"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantRoleUpdatedEvent.self, from: json)
        XCTAssertNil(event.participant.userId)
    }

    // MARK: - ConversationUpdatedEvent

    func test_conversationUpdatedEvent_allFields() throws {
        let json = """
        {
            "conversationId": "conv1",
            "title": "New Title",
            "description": "Updated description",
            "avatar": "https://cdn.meeshy.me/conv.jpg",
            "banner": "https://cdn.meeshy.me/banner.jpg",
            "defaultWriteRole": "USER",
            "isAnnouncementChannel": true,
            "slowModeSeconds": 30,
            "autoTranslateEnabled": true,
            "updatedBy": {"id": "u1"},
            "updatedAt": "2026-04-09T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.title, "New Title")
        XCTAssertEqual(event.description, "Updated description")
        XCTAssertEqual(event.avatar, "https://cdn.meeshy.me/conv.jpg")
        XCTAssertEqual(event.banner, "https://cdn.meeshy.me/banner.jpg")
        XCTAssertEqual(event.defaultWriteRole, "USER")
        XCTAssertEqual(event.isAnnouncementChannel, true)
        XCTAssertEqual(event.slowModeSeconds, 30)
        XCTAssertEqual(event.autoTranslateEnabled, true)
        XCTAssertEqual(event.updatedBy.id, "u1")
        XCTAssertEqual(event.updatedAt, "2026-04-09T10:00:00.000Z")
    }

    func test_conversationUpdatedEvent_minimalFields() throws {
        let json = """
        {
            "conversationId": "conv2",
            "updatedBy": {"id": "u2"},
            "updatedAt": "2026-04-09T11:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv2")
        XCTAssertNil(event.title)
        XCTAssertNil(event.description)
        XCTAssertNil(event.avatar)
        XCTAssertNil(event.banner)
        XCTAssertNil(event.defaultWriteRole)
        XCTAssertNil(event.isAnnouncementChannel)
        XCTAssertNil(event.slowModeSeconds)
        XCTAssertNil(event.autoTranslateEnabled)
    }

    // MARK: - UserPreferencesUpdatedEvent

    func test_userPreferencesUpdatedEvent_pinConversation() throws {
        let json = """
        {
            "userId": "u1",
            "category": "pin",
            "conversationId": "conv1",
            "isPinned": true
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(UserPreferencesUpdatedEvent.self, from: json)
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.category, "pin")
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.isPinned, true)
        XCTAssertNil(event.isMuted)
        XCTAssertNil(event.isArchived)
    }

    func test_userPreferencesUpdatedEvent_muteConversation() throws {
        let json = """
        {
            "userId": "u2",
            "category": "mute",
            "conversationId": "conv2",
            "isMuted": true
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(UserPreferencesUpdatedEvent.self, from: json)
        XCTAssertEqual(event.category, "mute")
        XCTAssertEqual(event.isMuted, true)
    }

    func test_userPreferencesUpdatedEvent_minimal() throws {
        let json = """
        {"userId": "u3", "category": "reaction", "reaction": "\u{1F44D}"}
        """.data(using: .utf8)!

        let event = try decoder.decode(UserPreferencesUpdatedEvent.self, from: json)
        XCTAssertEqual(event.category, "reaction")
        XCTAssertEqual(event.reaction, "\u{1F44D}")
        XCTAssertNil(event.conversationId)
    }

    // MARK: - ConversationStatsEvent

    func test_conversationStatsEvent_allFields() throws {
        let json = """
        {
            "conversationId": "conv1",
            "stats": {
                "participantCount": 25,
                "onlineUsers": [
                    {"id": "u1", "username": "alice", "firstName": "Alice", "lastName": "Dupont"},
                    {"id": "u2", "username": "bob"}
                ],
                "messagesPerLanguage": {"fr": 100, "en": 50, "es": 20},
                "participantsPerLanguage": {"fr": 10, "en": 8, "es": 7}
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationStatsEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.stats.participantCount, 25)
        XCTAssertEqual(event.stats.onlineUsers?.count, 2)
        XCTAssertEqual(event.stats.onlineUsers?[0].username, "alice")
        XCTAssertEqual(event.stats.onlineUsers?[0].firstName, "Alice")
        XCTAssertEqual(event.stats.onlineUsers?[1].username, "bob")
        XCTAssertNil(event.stats.onlineUsers?[1].firstName)
        XCTAssertEqual(event.stats.messagesPerLanguage?["fr"], 100)
        XCTAssertEqual(event.stats.participantsPerLanguage?["en"], 8)
    }

    func test_conversationStatsEvent_minimal() throws {
        let json = """
        {
            "conversationId": "conv2",
            "stats": {}
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationStatsEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv2")
        XCTAssertNil(event.stats.participantCount)
        XCTAssertNil(event.stats.onlineUsers)
        XCTAssertNil(event.stats.messagesPerLanguage)
    }

    // MARK: - ParticipantLeftEvent

    func test_participantLeftEvent_decoding() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "displayName": "Alice Dupont",
            "leftAt": "2026-04-09T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantLeftEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.displayName, "Alice Dupont")
        XCTAssertEqual(event.leftAt, "2026-04-09T10:00:00.000Z")
    }

    // MARK: - ParticipantBannedEvent

    func test_participantBannedEvent_decoding() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "bannedBy": {"id": "u2"},
            "bannedAt": "2026-04-09T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantBannedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.bannedBy.id, "u2")
        XCTAssertEqual(event.bannedAt, "2026-04-09T10:00:00.000Z")
    }

    // MARK: - ParticipantUnbannedEvent

    func test_participantUnbannedEvent_decoding() throws {
        let json = """
        {"conversationId": "conv1", "userId": "u1"}
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantUnbannedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.userId, "u1")
    }
}
