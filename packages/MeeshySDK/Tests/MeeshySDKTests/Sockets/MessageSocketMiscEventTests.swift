import XCTest
@testable import MeeshySDK

/// Additional message socket event struct decoding tests for types not yet covered.
/// Covers: ReactionSyncEvent, AttachmentStatusEvent, MentionCreatedEvent,
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

    /// `mentionedParticipantId` reste dans le JSON alors que le type ne le
    /// décode plus : aucun émetteur ne l'a jamais peuplé (les trois — envoi WS,
    /// envoi REST/ZMQ, édition — l'omettent), et rien ne le lisait. Le garder
    /// ICI prouve ce qui compte désormais : une clé inconnue dans le payload
    /// n'empêche pas le décodage, donc retirer le champ ne casse aucun client
    /// face à une gateway qui l'enverrait encore.
    func test_mentionCreatedEvent_allFields() throws {
        let json = """
        {
            "messageId": "msg1",
            "conversationId": "conv1",
            "senderId": "u1",
            "mentionedUserId": "u2",
            "mentionedParticipantId": "p2",
            "content": "Hey @bob check this out",
            "unknownFutureField": true,
            "timestamp": "2026-04-09T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(MentionCreatedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.senderId, "u1")
        XCTAssertEqual(event.mentionedUserId, "u2")
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
        XCTAssertEqual(event.participant?.id, "p1")
        XCTAssertEqual(event.participant?.role, "MODERATOR")
        XCTAssertEqual(event.participant?.displayName, "Alice")
        XCTAssertEqual(event.participant?.userId, "u1")
    }

    /// La charge utile RÉELLE de la passerelle depuis le cycle 92 bis : le rang de
    /// conversation est passé sous `conversationRole`, et `role` porte désormais
    /// le rôle GLOBAL. Le rang à APPLIQUER reste `newRole`, au premier niveau.
    func test_participantRoleUpdatedEvent_serializedWireShape() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "newRole": "admin",
            "updatedBy": "u2",
            "participant": {
                "id": "p1",
                "participantId": "p1",
                "userId": "u1",
                "displayName": "Alice",
                "role": "USER",
                "conversationRole": "admin",
                "isOnline": false,
                "lastActiveAt": null
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantRoleUpdatedEvent.self, from: json)
        XCTAssertEqual(event.newRole, "admin")
        XCTAssertEqual(event.participant?.conversationRole, "admin")
        XCTAssertEqual(event.participant?.role, "USER")
    }

    /// La passerelle envoie `participant: null` quand la relecture du rang ne
    /// rend rien, et le type partagé le déclare optionnel. Ce bloc était
    /// NON-optionnel ici : un `null` faisait échouer le décodage de l'événement
    /// ENTIER, que le manager journalise et JETTE — donc aucun rafraîchissement
    /// du trombinoscope, sans trace côté produit. Ce qui sert à appliquer le
    /// changement est au premier niveau, et doit survivre seul.
    func test_participantRoleUpdatedEvent_nullParticipant_keepsTheEvent() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "newRole": "moderator",
            "updatedBy": "u2",
            "participant": null
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantRoleUpdatedEvent.self, from: json)
        XCTAssertNil(event.participant)
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.newRole, "moderator")
    }

    func test_participantRoleUpdatedEvent_absentParticipant_keepsTheEvent() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "newRole": "member",
            "updatedBy": "u2"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantRoleUpdatedEvent.self, from: json)
        XCTAssertNil(event.participant)
        XCTAssertEqual(event.newRole, "member")
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
        XCTAssertNil(event.participant?.userId)
    }

    // MARK: - ConversationUpdatedEvent

    func test_conversationUpdatedEvent_decodesWithUpdatedBy() throws {
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
        XCTAssertEqual(event.updatedBy?.id, "u1")
        XCTAssertEqual(event.updatedAt, "2026-04-09T10:00:00.000Z")
        XCTAssertFalse(event.previewRecalculated,
                       "a metadata-driven update is not a preview recalculation")
    }

    // `previewRecalculated` — le drapeau qui autorise le groupe d'aperçu à
    // RECULER dans le temps. Ces deux témoins tiennent le NOM de la clé : le
    // gateway l'écrit dans `emitConversationPreviewUpdate`, et une orthographe
    // qui divergerait ne casserait rien de visible — elle rendrait simplement
    // le correctif inerte, ce qui est précisément l'état d'AVANT.

    func test_conversationUpdatedEvent_decodesPreviewRecalculatedFlag() throws {
        let json = """
        {
            "conversationId": "conv1",
            "lastMessageId": "msg-previous",
            "lastMessagePreview": "celui d avant",
            "updatedBy": {"id": "u1"},
            "updatedAt": "2026-04-09T10:00:00.000Z",
            "previewRecalculated": true
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertTrue(event.previewRecalculated)
    }

    func test_conversationUpdatedEvent_absentPreviewRecalculated_defaultsToFalse() throws {
        let json = """
        {
            "conversationId": "conv1",
            "lastMessageId": "msg-1",
            "updatedAt": "2026-04-09T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertFalse(event.previewRecalculated,
                       "an older gateway omits the key — the row must keep the pre-existing monotone rule")
    }

    // Le tri-état du Prisme. `Optional` confondrait « clé absente » (renommage :
    // ne pas toucher la carte) et « clé nulle » (le serveur DIT que la carte est
    // périmée après une édition). Ces trois témoins fixent la distinction sur le
    // fil, là où elle est décidée.

    func test_conversationUpdatedEvent_absentTranslationsKey_isUnchanged() throws {
        let json = """
        {
            "conversationId": "conv3",
            "title": "Renamed",
            "updatedAt": "2026-04-09T11:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.lastMessageTranslations, .unchanged)
    }

    func test_conversationUpdatedEvent_nullTranslations_isReplacedEmpty() throws {
        let json = """
        {
            "conversationId": "conv3",
            "lastMessagePreview": "Hello (edited)",
            "lastMessageTranslations": null,
            "lastMessageOriginalLanguage": "en",
            "updatedAt": "2026-04-09T11:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.lastMessageTranslations, .replaced([:]),
                       "an explicit null expires the client map — it is a value, not an absence")
        XCTAssertEqual(event.lastMessageOriginalLanguage, "en")
    }

    func test_conversationUpdatedEvent_translationsMap_isReplacedWithIt() throws {
        let json = """
        {
            "conversationId": "conv3",
            "lastMessagePreview": "Hello",
            "lastMessageTranslations": {"fr": "Bonjour"},
            "lastMessageOriginalLanguage": "en",
            "updatedAt": "2026-04-09T11:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.lastMessageTranslations, .replaced(["fr": "Bonjour"]))
    }

    // Le MÊME tri-état, appliqué au champ qui NOMME le message. La clé nulle y
    // dit « ce lecteur n'a plus aucun message visible ici » — l'état d'un
    // lecteur qui vient de masquer pour lui le dernier qui lui restait. Sans la
    // distinction, ce payload (dont TOUT le groupe vaut `null`) se lit comme un
    // renommage : rien ne s'applique, et la ligne garde l'aperçu de ce qui vient
    // de disparaître.

    func test_conversationUpdatedEvent_absentLastMessageIdKey_isUnchanged() throws {
        let json = """
        {
            "conversationId": "conv4",
            "title": "Renamed",
            "updatedAt": "2026-08-16T11:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.lastMessage, .unchanged)
        XCTAssertNil(event.lastMessageIdValue)
    }

    func test_conversationUpdatedEvent_nullLastMessageId_isReplacedWithNothing() throws {
        let json = """
        {
            "conversationId": "conv4",
            "lastMessageAt": null,
            "lastMessageId": null,
            "lastMessagePreview": null,
            "lastMessageTranslations": null,
            "senderId": null,
            "updatedBy": {"id": "u1"},
            "updatedAt": "2026-08-16T11:00:00.000Z",
            "previewRecalculated": true
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.lastMessage, .replaced(nil),
                       "an explicit null says there is no visible message left — it is a value, not an absence")
        XCTAssertNil(event.lastMessageAt)
        XCTAssertTrue(event.previewRecalculated)
    }

    func test_conversationUpdatedEvent_lastMessageId_isReplacedWithIt() throws {
        let json = """
        {
            "conversationId": "conv4",
            "lastMessageId": "msg-7",
            "lastMessagePreview": "Hello",
            "updatedAt": "2026-08-16T11:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.lastMessage, .replaced("msg-7"))
        XCTAssertEqual(event.lastMessageIdValue, "msg-7")
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
        XCTAssertNil(event.lastMessageAt, "Old payloads without lastMessageAt must still decode and expose nil")
    }

    /// The gateway's message-driven CONVERSATION_UPDATED payload
    /// (handlers/MessageHandler.ts on every new message) carries
    /// `{ conversationId, lastMessageAt, lastMessageId,
    /// lastMessagePreview, senderId, updatedAt }` — no `updatedBy`. Before
    /// `updatedBy` was made optional, this payload silently failed to
    /// decode with `keyNotFound` and `bumpToTop` never fired in production.
    /// This test pins the SDK to the gateway's real shape.
    func test_conversationUpdatedEvent_decodesWithoutUpdatedBy() throws {
        let json = """
        {
            "conversationId": "conv-msg-driven",
            "lastMessageAt": "2026-05-09T08:30:00.000Z",
            "lastMessageId": "msg-42",
            "lastMessagePreview": "Hello there",
            "senderId": "u-sender",
            "updatedAt": "2026-05-09T08:30:00.000Z"
        }
        """.data(using: .utf8)!

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let dateDecoder = JSONDecoder()
        dateDecoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            if let date = isoFormatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(str)")
        }

        let event = try dateDecoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv-msg-driven")
        XCTAssertNil(event.updatedBy, "Message-driven payload has no updatedBy and must decode it as nil instead of failing")
        XCTAssertNotNil(event.lastMessageAt)
    }

    /// The gateway broadcasts CONVERSATION_UPDATED on every new message
    /// (handlers/MessageHandler.ts) carrying the new lastMessageAt so iOS
    /// can re-sort the conversation list without waiting for a delta sync.
    /// The SDK MUST expose this field so the ViewModel can bumpToTop.
    func test_conversationUpdatedEvent_decodesLastMessageAt() throws {
        let json = """
        {
            "conversationId": "conv-bump",
            "lastMessageAt": "2026-04-09T12:34:56.789Z",
            "updatedBy": {"id": "u3"},
            "updatedAt": "2026-04-09T12:34:56.789Z"
        }
        """.data(using: .utf8)!

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let dateDecoder = JSONDecoder()
        dateDecoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            if let date = isoFormatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(str)")
        }

        let event = try dateDecoder.decode(ConversationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv-bump")
        XCTAssertNotNil(event.lastMessageAt)
        if let lastAt = event.lastMessageAt {
            let expected = isoFormatter.date(from: "2026-04-09T12:34:56.789Z")!
            XCTAssertEqual(lastAt.timeIntervalSinceReferenceDate, expected.timeIntervalSinceReferenceDate, accuracy: 0.01)
        }
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

    // MARK: - Appartenance : ce que le bannissement retire, ce que le débannissement rend

    func test_participantBannedEvent_membershipEnded_absent_readsAsTrue() throws {
        // Un serveur antérieur à ce champ ne bannissait qu'en retirant. Lire
        // l'absence comme `false` ferait ignorer tous ses bannissements.
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "bannedBy": {"id": "u2"},
            "bannedAt": "2026-04-09T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantBannedEvent.self, from: json)
        XCTAssertNil(event.membershipEnded)
        XCTAssertTrue(event.didEndMembership)
    }

    func test_participantBannedEvent_membershipEnded_false_whenTargetHadAlreadyLeft() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "bannedBy": {"id": "u2"},
            "bannedAt": "2026-04-09T10:00:00.000Z",
            "membershipEnded": false
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantBannedEvent.self, from: json)
        XCTAssertEqual(event.membershipEnded, false)
        XCTAssertFalse(event.didEndMembership)
    }

    func test_participantUnbannedEvent_membershipRestored_absent_readsAsTrue() throws {
        let json = """
        {"conversationId": "conv1", "userId": "u1"}
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantUnbannedEvent.self, from: json)
        XCTAssertNil(event.membershipRestored)
        XCTAssertTrue(event.didRestoreMembership)
    }

    func test_participantUnbannedEvent_membershipRestored_false_whenNobodyWasReadmitted() throws {
        let json = """
        {"conversationId": "conv1", "userId": "u1", "membershipRestored": false}
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantUnbannedEvent.self, from: json)
        XCTAssertEqual(event.membershipRestored, false)
        XCTAssertFalse(event.didRestoreMembership)
    }

    // MARK: - `memberCount` : l'effectif ABSOLU des quatre événements d'appartenance
    //
    // Le gateway le porte sur les quatre, et il le documente « à POSER, pas à
    // incrémenter » : un delta ne rattrape jamais un événement manqué, et les
    // deux clients PERSISTENT la dérive. Le champ n'était décodé sur AUCUN des
    // quatre — le contrat existait côté serveur et côté web, sans récepteur ici.

    func test_participantJoinedEvent_decodesTheAbsoluteMemberCount() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "displayName": "Alice Dupont",
            "joinedAt": "2026-04-09T10:00:00.000Z",
            "memberCount": 12
        }
        """.data(using: .utf8)!

        XCTAssertEqual(try decoder.decode(ParticipantJoinedEvent.self, from: json).memberCount, 12)
    }

    func test_participantLeftEvent_decodesTheAbsoluteMemberCount() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "displayName": "Alice Dupont",
            "leftAt": "2026-04-09T10:00:00.000Z",
            "memberCount": 11
        }
        """.data(using: .utf8)!

        XCTAssertEqual(try decoder.decode(ParticipantLeftEvent.self, from: json).memberCount, 11)
    }

    func test_participantBannedEvent_decodesTheAbsoluteMemberCount() throws {
        let json = """
        {
            "conversationId": "conv1",
            "userId": "u1",
            "bannedBy": {"id": "u2"},
            "bannedAt": "2026-04-09T10:00:00.000Z",
            "membershipEnded": false,
            "memberCount": 8
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ParticipantBannedEvent.self, from: json)
        XCTAssertEqual(event.memberCount, 8)
        XCTAssertFalse(event.didEndMembership,
            "l'effectif absolu n'efface pas `membershipEnded` — il le rend seulement inutile au calcul")
    }

    func test_participantUnbannedEvent_decodesTheAbsoluteMemberCount() throws {
        let json = """
        {"conversationId": "conv1", "userId": "u1", "memberCount": 9}
        """.data(using: .utf8)!

        XCTAssertEqual(try decoder.decode(ParticipantUnbannedEvent.self, from: json).memberCount, 9)
    }

    func test_participantEvents_absentMemberCount_decodesAsNil_notZero() throws {
        // Rétro-compatibilité : un gateway antérieur au contrat n'envoie pas le
        // champ, et `nil` est ce qui fait retomber le client sur le delta. Un
        // zéro par défaut viderait la conversation à chaque événement.
        let joined = """
        {"conversationId": "c", "userId": "u", "displayName": "A", "joinedAt": "2026-04-09T10:00:00.000Z"}
        """.data(using: .utf8)!
        let left = """
        {"conversationId": "c", "userId": "u", "displayName": "A", "leftAt": "2026-04-09T10:00:00.000Z"}
        """.data(using: .utf8)!
        let unbanned = """
        {"conversationId": "c", "userId": "u"}
        """.data(using: .utf8)!

        XCTAssertNil(try decoder.decode(ParticipantJoinedEvent.self, from: joined).memberCount)
        XCTAssertNil(try decoder.decode(ParticipantLeftEvent.self, from: left).memberCount)
        XCTAssertNil(try decoder.decode(ParticipantUnbannedEvent.self, from: unbanned).memberCount)
    }

    // MARK: - MessageHiddenForMeEvent

    func test_messageHiddenForMeEvent_decodesBatchAcrossConversations() throws {
        let json = """
        {
            "userId": "u1",
            "messages": [
                {"messageId": "m1", "conversationId": "c1"},
                {"messageId": "m2", "conversationId": "c2"}
            ],
            "hiddenAt": "2026-08-16T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(MessageHiddenForMeEvent.self, from: json)
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.messages, [
            PersonalMessageVisibilityRef(messageId: "m1", conversationId: "c1"),
            PersonalMessageVisibilityRef(messageId: "m2", conversationId: "c2"),
        ])
        XCTAssertEqual(event.hiddenAt, "2026-08-16T10:00:00.000Z")
    }

    /// La route unitaire émet une liste d'UN élément — les clients n'ont qu'une
    /// forme à traiter, jamais deux.
    func test_messageHiddenForMeEvent_singleMessageIsStillAList() throws {
        let json = """
        {"userId": "u1", "messages": [{"messageId": "m1", "conversationId": "c1"}], "hiddenAt": "2026-08-16T10:00:00.000Z"}
        """.data(using: .utf8)!

        XCTAssertEqual(try decoder.decode(MessageHiddenForMeEvent.self, from: json).messages.count, 1)
    }

    /// `hiddenAt` n'arbitre rien (le masquage est un fait par-lecteur, sans
    /// concurrence à départager) : son absence ne doit pas faire échouer le
    /// décodage et perdre le retrait.
    func test_messageHiddenForMeEvent_absentHiddenAt_decodesAsNil() throws {
        let json = """
        {"userId": "u1", "messages": [{"messageId": "m1", "conversationId": "c1"}]}
        """.data(using: .utf8)!

        let event = try decoder.decode(MessageHiddenForMeEvent.self, from: json)
        XCTAssertNil(event.hiddenAt)
        XCTAssertEqual(event.messages.first?.messageId, "m1")
    }

    // MARK: - MessageRestoredForMeEvent

    /// Le jumeau inverse. Même forme de lot que le masquage — un seul gabarit à
    /// traiter côté client, dans les deux sens.
    func test_messageRestoredForMeEvent_decodesBatchAcrossConversations() throws {
        let json = """
        {
            "userId": "u1",
            "messages": [
                {"messageId": "m1", "conversationId": "c1"},
                {"messageId": "m2", "conversationId": "c2"}
            ],
            "restoredAt": "2026-08-21T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(MessageRestoredForMeEvent.self, from: json)
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.messages, [
            PersonalMessageVisibilityRef(messageId: "m1", conversationId: "c1"),
            PersonalMessageVisibilityRef(messageId: "m2", conversationId: "c2"),
        ])
        XCTAssertEqual(event.restoredAt, "2026-08-21T10:00:00.000Z")
    }

    /// La route unitaire de restauration (`POST /api/messages/:id/restore-for-me`)
    /// n'en rend qu'un — et l'émet quand même comme une liste d'UN élément.
    func test_messageRestoredForMeEvent_singleMessageIsStillAList() throws {
        let json = """
        {"userId": "u1", "messages": [{"messageId": "m1", "conversationId": "c1"}], "restoredAt": "2026-08-21T10:00:00.000Z"}
        """.data(using: .utf8)!

        XCTAssertEqual(try decoder.decode(MessageRestoredForMeEvent.self, from: json).messages.count, 1)
    }

    /// `restoredAt` n'arbitre rien, exactement comme `hiddenAt` : son absence
    /// ne doit pas faire échouer le décodage et perdre le RETOUR d'un message —
    /// une perte qu'aucun rechargement ne rattraperait, puisque le serveur ne
    /// ré-émettra jamais cet événement.
    func test_messageRestoredForMeEvent_absentRestoredAt_decodesAsNil() throws {
        let json = """
        {"userId": "u1", "messages": [{"messageId": "m1", "conversationId": "c1"}]}
        """.data(using: .utf8)!

        let event = try decoder.decode(MessageRestoredForMeEvent.self, from: json)
        XCTAssertNil(event.restoredAt)
        XCTAssertEqual(event.messages.first?.messageId, "m1")
    }

    /// La charge utile ne porte AUCUN contenu, et c'est structurel : un client
    /// qui croirait pouvoir ré-afficher depuis l'événement seul n'aurait jamais
    /// de texte à poser. Le contrat se lit ici, pas dans un commentaire.
    func test_messageRestoredForMeEvent_carriesAddressesOnly_noContent() throws {
        let json = """
        {"userId": "u1", "messages": [{"messageId": "m1", "conversationId": "c1", "content": "ignoré"}]}
        """.data(using: .utf8)!

        let ref = try decoder.decode(MessageRestoredForMeEvent.self, from: json).messages.first
        XCTAssertEqual(ref, PersonalMessageVisibilityRef(messageId: "m1", conversationId: "c1"))
    }
}
