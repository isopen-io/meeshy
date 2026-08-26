import XCTest
@testable import MeeshySDK

final class APIMessageToMessageTests: XCTestCase {

    // MARK: - Factory

    private func makeAPIMessage(
        id: String = "msg-test",
        conversationId: String = "conv-1",
        senderId: String = "sender-1",
        content: String = "Hello",
        createdAt: Date = Date(),
        extraFields: [String: Any] = [:]
    ) -> APIMessage {
        var json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": senderId,
            "content": content,
            "createdAt": ISO8601DateFormatter().string(from: createdAt),
            "updatedAt": ISO8601DateFormatter().string(from: createdAt),
        ]
        for (key, value) in extraFields {
            json[key] = value
        }
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIMessage.self, from: data)
    }

    private func makeSenderJSON(
        id: String = "participant-1",
        displayName: String = "John",
        avatar: String? = nil,
        type: String = "user",
        userId: String? = "user-1",
        username: String? = "john",
        userBlock: [String: Any]? = nil
    ) -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "displayName": displayName,
            "type": type,
        ]
        if let avatar { dict["avatar"] = avatar }
        if let userId { dict["userId"] = userId }
        if let username { dict["username"] = username }
        if let userBlock {
            dict["user"] = userBlock
        }
        return dict
    }

    // MARK: - isMe by userId

    func test_toMessage_isMe_matchesByUserId() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-42", username: "john"),
        ])

        let msg = api.toMessage(currentUserId: "user-42")

        XCTAssertTrue(msg.isMe)
    }

    // MARK: - isMe by username fallback

    func test_toMessage_isMe_matchesByUsername_whenUserIdDiffers() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-99", username: "john"),
        ])

        let msg = api.toMessage(currentUserId: "user-42", currentUsername: "john")

        XCTAssertTrue(msg.isMe)
    }

    // MARK: - isMe case-insensitive username

    func test_toMessage_isMe_caseInsensitiveUsername() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-99", username: "John"),
        ])

        let msg = api.toMessage(currentUserId: "user-42", currentUsername: "john")

        XCTAssertTrue(msg.isMe)
    }

    // MARK: - isMe false when neither matches

    func test_toMessage_isMe_falseWhenNeitherMatches() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-99", username: "alice"),
        ])

        let msg = api.toMessage(currentUserId: "user-42", currentUsername: "bob")

        XCTAssertFalse(msg.isMe)
    }

    // MARK: - isMe without currentUsername

    func test_toMessage_isMe_noCurrentUsername_fallsBackToUserId() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-99", username: "john"),
        ])

        let msg = api.toMessage(currentUserId: "user-99")

        XCTAssertTrue(msg.isMe)

        let msg2 = api.toMessage(currentUserId: "user-42")

        XCTAssertFalse(msg2.isMe)
    }

    // MARK: - own message with a stripped sender envelope falls back to the local identity

    func test_toMessage_senderEnvelopeMissing_ownMessage_usesLocalIdentity() {
        let api = makeAPIMessage(senderId: "user-42")

        let msg = api.toMessage(
            currentUserId: "user-42",
            currentUsername: "jcnm",
            currentUserDisplayName: "Jean-Charles"
        )

        XCTAssertTrue(msg.isMe)
        XCTAssertEqual(msg.senderName, "Jean-Charles")
        XCTAssertEqual(msg.senderUsername, "jcnm")
    }

    func test_toMessage_senderEnvelopeMissing_otherAuthor_keepsSenderNil() {
        let api = makeAPIMessage(senderId: "user-99")

        let msg = api.toMessage(
            currentUserId: "user-42",
            currentUsername: "jcnm",
            currentUserDisplayName: "Jean-Charles"
        )

        XCTAssertFalse(msg.isMe)
        XCTAssertNil(msg.senderName)
        XCTAssertNil(msg.senderUsername)
    }

    func test_toMessage_serverSenderName_winsOverLocalIdentity() {
        let api = makeAPIMessage(senderId: "user-42", extraFields: [
            "sender": makeSenderJSON(displayName: "Server Name", userId: "user-42", username: "server_user"),
        ])

        let msg = api.toMessage(
            currentUserId: "user-42",
            currentUsername: "jcnm",
            currentUserDisplayName: "Jean-Charles"
        )

        XCTAssertEqual(msg.senderName, "Server Name")
        XCTAssertEqual(msg.senderUsername, "server_user")
    }

    // MARK: - senderUserId preserved

    func test_toMessage_preservesSenderUserId() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-77"),
        ])

        let msg = api.toMessage(currentUserId: "someone-else")

        XCTAssertEqual(msg.senderUserId, "user-77")
    }

    // MARK: - editedAt decoded (server's clock, used to order `message:edited` events)

    func test_decode_preservesEditedAt() {
        let editedAt = Date(timeIntervalSince1970: 1_700_000_000)
        let api = makeAPIMessage(extraFields: [
            "isEdited": true,
            "editedAt": ISO8601DateFormatter().string(from: editedAt),
        ])

        XCTAssertEqual(api.editedAt, editedAt)
    }

    func test_decode_editedAtNilWhenAbsent() {
        let api = makeAPIMessage()

        XCTAssertNil(api.editedAt)
    }

    // MARK: - senderUsername preserved

    func test_toMessage_preservesSenderUsername() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(username: "charlie"),
        ])

        let msg = api.toMessage(currentUserId: "someone-else")

        XCTAssertEqual(msg.senderUsername, "charlie")
    }

    // MARK: - senderUsername from nested user block

    func test_toMessage_preservesSenderUsername_fromUserBlock() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(
                username: nil,
                userBlock: ["id": "user-1", "username": "nested_user", "displayName": "Nested"]
            ),
        ])

        let msg = api.toMessage(currentUserId: "someone-else")

        XCTAssertEqual(msg.senderUsername, "nested_user")
    }

    // MARK: - storyReplyToId preserved

    func test_toMessage_preservesStoryReplyToId() {
        let storyId = "story-abc-123"
        let api = makeAPIMessage(extraFields: [
            "storyReplyToId": storyId,
        ])

        let msg = api.toMessage(currentUserId: "user-1")

        XCTAssertEqual(msg.storyReplyToId, storyId)
        XCTAssertNotNil(msg.replyTo)
        XCTAssertTrue(msg.replyTo?.isStoryReply ?? false)
    }

    // MARK: - mood reply enrichment (storyReplyTo.moodEmoji)

    func test_toMessage_storyReplyTo_withMoodEmoji_buildsMoodReply() {
        let api = makeAPIMessage(extraFields: [
            "storyReplyToId": "status-1",
            "storyReplyTo": [
                "id": "status-1",
                "reactionCount": 0,
                "commentCount": 0,
                "createdAt": ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: 1_700_000_000)),
                "previewText": "en forme",
                "moodEmoji": "🔥"
            ]
        ])

        let reply = api.toMessage(currentUserId: "user-1").replyTo

        XCTAssertEqual(reply?.moodEmoji, "🔥")
        XCTAssertEqual(reply?.previewText, "en forme")
        XCTAssertTrue(reply?.isStoryReply ?? false)
        XCTAssertNotNil(reply?.storyPublishedAt)
    }

    func test_toMessage_storyReplyTo_withoutMoodEmoji_staysStory() {
        let api = makeAPIMessage(extraFields: [
            "storyReplyToId": "story-1",
            "storyReplyTo": [
                "id": "story-1",
                "reactionCount": 2,
                "commentCount": 1,
                "createdAt": ISO8601DateFormatter().string(from: Date()),
                "previewText": "ma story"
            ]
        ])

        let reply = api.toMessage(currentUserId: "user-1").replyTo

        XCTAssertNil(reply?.moodEmoji)
        XCTAssertTrue(reply?.isStoryReply ?? false)
        XCTAssertEqual(reply?.previewText, "ma story")
    }

    // MARK: - attachment thumbHash preserved

    func test_toMessage_preservesThumbHash() {
        let thumbHashValue = "1QcSHQRnh493V4dIh4eXh1h4kJUI"
        let api = makeAPIMessage(extraFields: [
            "attachments": [
                [
                    "id": "att-1",
                    "fileName": "photo.jpg",
                    "mimeType": "image/jpeg",
                    "fileUrl": "https://example.com/photo.jpg",
                    "thumbHash": thumbHashValue,
                ] as [String: Any],
            ],
        ])

        let msg = api.toMessage(currentUserId: "user-1")

        XCTAssertEqual(msg.attachments.count, 1)
        XCTAssertEqual(msg.attachments.first?.thumbHash, thumbHashValue)
    }

    // MARK: - ForwardReference : type + fallback nom de la conversation source

    // Le gateway sélectionne `type` sur les deux chemins (REST + socket) mais
    // la conversion le JETAIT — impossible de distinguer un groupe d'un
    // tête-à-tête au badge « Transféré » (spec 2026-08-19, Volet C).
    func test_toMessage_mapsForwardedConversationType() {
        let api = makeAPIMessage(extraFields: [
            "forwardedFromId": "fwd-1",
            "forwardedFrom": [
                "id": "fwd-1",
                "content": "hello",
                "sender": makeSenderJSON(displayName: "Alice"),
            ],
            "forwardedFromConversation": [
                "id": "conv-src",
                "title": "Équipe",
                "type": "group",
            ],
        ])

        let msg = api.toMessage(currentUserId: "user-1")

        XCTAssertEqual(msg.forwardedFrom?.conversationType, "group")
        XCTAssertEqual(msg.forwardedFrom?.conversationName, "Équipe")
    }

    func test_toMessage_forwardedConversationName_fallsBackToIdentifier() {
        let api = makeAPIMessage(extraFields: [
            "forwardedFromId": "fwd-1",
            "forwardedFrom": ["id": "fwd-1", "content": "hello"],
            "forwardedFromConversation": [
                "id": "conv-src",
                "identifier": "meeshy-public",
                "type": "public",
            ],
        ])

        let msg = api.toMessage(currentUserId: "user-1")

        XCTAssertEqual(msg.forwardedFrom?.conversationName, "meeshy-public",
                       "un public sans titre garde un nom affichable — même repli que MeeshyConversation.name")
        XCTAssertEqual(msg.forwardedFrom?.conversationType, "public")
    }

    // MARK: - Avis d'arrivée — charge RÉELLE du gateway (2026-08-24)

    /// Capturée sur `GET /conversations/:id/messages` en production : c'est
    /// mot pour mot ce que le serveur envoie quand un visiteur rejoint. Un
    /// test bâti sur une charge inventée aurait pu passer sur une forme que
    /// personne n'émet.
    private static let realJoinNoticePayload = """
    {
      "id": "6a86b5f43d04f22eeeba09d1",
      "conversationId": "691b5178f2a610248cec4f5d",
      "senderId": "6a86b5f43d04f22eeeba09d0",
      "content": "ano_daily_l378 a rejoint la conversation — visiteur sans compte",
      "originalLanguage": "fr",
      "messageType": "system",
      "messageSource": "system",
      "metadata": {
        "kind": "member-joined",
        "participantId": "6a86b5f43d04f22eeeba09d0",
        "displayName": "ano_daily_l378",
        "isAnonymous": true,
        "viaShareLink": true
      },
      "createdAt": "2026-08-20T08:08:20.156Z",
      "updatedAt": "2026-08-20T08:08:20.156Z",
      "sender": {
        "id": "6a86b5f43d04f22eeeba09d0",
        "userId": null,
        "username": "ano_daily_l378",
        "displayName": "Daily Moon",
        "avatar": null,
        "isOnline": false,
        "type": "anonymous"
      },
      "attachments": []
    }
    """

    /// **Le décodeur du VRAI client**, pas un décodeur de test : un
    /// `.iso8601` strict refuse les fractions de seconde que le gateway
    /// envoie (`…:20.156Z`), et le test aurait rougi sur son propre outillage
    /// au lieu de mesurer le code.
    private func decodeRealJoinNotice() throws -> APIMessage {
        try APIClient.makeAPIPayloadDecoder()
            .decode(APIMessage.self, from: Data(Self.realJoinNoticePayload.utf8))
    }

    /// L'avis doit se reconnaître comme SYSTÈME : sans cela il s'affiche avec
    /// l'avatar et le nom de l'arrivant, comme une parole ordinaire, et le
    /// repli textuel du gateway tient lieu de rendu.
    func test_realJoinNotice_decodesAsASystemMessage() throws {
        let api = try decodeRealJoinNotice()
        XCTAssertEqual(api.messageSource, "system", "le champ arrive bien du serveur")
        let message = api.toMessage(currentUserId: "someone-else")
        XCTAssertEqual(message.messageSource, MeeshyMessage.MessageSource.system, "et survit à la conversion domaine")
    }

    /// Et il doit porter son `joinNotice` — c'est lui qui déclenche la bulle
    /// dédiée plutôt que la ligne de texte.
    func test_realJoinNotice_carriesItsMetadata() throws {
        let api = try decodeRealJoinNotice()
        let notice = try XCTUnwrap(api.joinNotice, "metadata.kind == member-joined doit décoder")
        XCTAssertEqual(notice.displayName, "ano_daily_l378")
        XCTAssertTrue(notice.isAnonymous)
        XCTAssertTrue(notice.viaShareLink)
        XCTAssertNotNil(api.toMessage(currentUserId: "someone-else").joinNotice, "et voyager jusqu'au modèle domaine")
    }
}
