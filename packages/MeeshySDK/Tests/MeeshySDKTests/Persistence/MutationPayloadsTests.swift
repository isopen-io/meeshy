import XCTest
@testable import MeeshySDK

/// Wave 1 Phase B — payload encoding contract.
///
/// The OutboxDispatcher decodes these structs from `OutboxRecord.payload`
/// at flush time, so any change to the wire shape silently breaks replays
/// of records that were enqueued by a previous app version. These tests
/// pin the JSON shape so a refactor that drops a field or renames a key
/// fails loudly in CI instead of in the field.
final class MutationPayloadsTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    // MARK: - BlockUserPayload

    func test_blockUserPayload_encoding_includesCmidAndTargetUserId() throws {
        let payload = BlockUserPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000001",
            targetUserId: "user-123"
        )

        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["clientMutationId"] as? String, "cmid_00000000-0000-4000-8000-000000000001")
        XCTAssertEqual(object["targetUserId"] as? String, "user-123")
        XCTAssertEqual(object.keys.count, 2)
    }

    func test_blockUserPayload_roundtrip() throws {
        let original = BlockUserPayload(
            clientMutationId: ClientMutationId.generate(),
            targetUserId: "u-abc"
        )

        let data = try encoder.encode(original)
        let decoded = try decoder.decode(BlockUserPayload.self, from: data)

        XCTAssertEqual(decoded, original)
    }

    // MARK: - UnblockUserPayload

    func test_unblockUserPayload_roundtrip() throws {
        let original = UnblockUserPayload(
            clientMutationId: ClientMutationId.generate(),
            targetUserId: "u-xyz"
        )

        let data = try encoder.encode(original)
        let decoded = try decoder.decode(UnblockUserPayload.self, from: data)

        XCTAssertEqual(decoded, original)
    }

    // MARK: - SendFriendRequestPayload

    func test_sendFriendRequestPayload_encoding_usesTargetUserIdKey() throws {
        let payload = SendFriendRequestPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000002",
            targetUserId: "user-456"
        )

        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["targetUserId"] as? String, "user-456")
        // The gateway translates this to `receiverId` at the wire boundary in
        // OutboxDispatcher.dispatchSendFriendRequest — the payload itself
        // keeps the consumer-facing name.
        XCTAssertNil(object["receiverId"])
    }

    // MARK: - RespondFriendRequestPayload

    func test_respondFriendRequestPayload_encoding_acceptAction() throws {
        let payload = RespondFriendRequestPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000003",
            friendRequestId: "fr-123",
            action: .accept
        )

        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["friendRequestId"] as? String, "fr-123")
        XCTAssertEqual(object["action"] as? String, "accept")
    }

    func test_respondFriendRequestPayload_encoding_rejectAction() throws {
        let payload = RespondFriendRequestPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000004",
            friendRequestId: "fr-456",
            action: .reject
        )

        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["action"] as? String, "reject")
    }

    func test_respondFriendRequestPayload_actionRoundtrip() throws {
        for action in [RespondFriendRequestPayload.Action.accept, .reject] {
            let original = RespondFriendRequestPayload(
                clientMutationId: ClientMutationId.generate(),
                friendRequestId: "fr-\(action.rawValue)",
                action: action
            )
            let data = try encoder.encode(original)
            let decoded = try decoder.decode(RespondFriendRequestPayload.self, from: data)
            XCTAssertEqual(decoded, original)
        }
    }

    // MARK: - UpdateProfilePayload

    func test_updateProfilePayload_encoding_allFields() throws {
        let payload = UpdateProfilePayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000005",
            displayName: "Alice",
            bio: "Hello world",
            avatarUrl: "https://cdn.example.com/avatar.jpg"
        )

        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["displayName"] as? String, "Alice")
        XCTAssertEqual(object["bio"] as? String, "Hello world")
        XCTAssertEqual(object["avatarUrl"] as? String, "https://cdn.example.com/avatar.jpg")
    }

    func test_updateProfilePayload_roundtrip_withNilFields() throws {
        let original = UpdateProfilePayload(
            clientMutationId: ClientMutationId.generate(),
            displayName: "Bob",
            bio: nil,
            avatarUrl: nil
        )

        let data = try encoder.encode(original)
        let decoded = try decoder.decode(UpdateProfilePayload.self, from: data)

        XCTAssertEqual(decoded, original)
    }

    // MARK: - clientMutationId format

    func test_allPayloads_clientMutationId_matchesCmidFormat() {
        // Every payload generated via the canonical helper must be valid
        // per the gateway-side regex (`cmid_<uuid v4 lowercase>`).
        for _ in 0..<10 {
            let cmid = ClientMutationId.generate()
            XCTAssertTrue(ClientMutationId.isValid(cmid), "Generated cmid \(cmid) must satisfy the gateway regex")
        }
    }

    // MARK: - MarkAsReadPayload (Phase C)

    func test_markAsReadPayload_roundtrip() throws {
        let original = MarkAsReadPayload(
            clientMutationId: ClientMutationId.generate(),
            conversationId: "conv-123",
            messageIds: ["msg-456"]
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(MarkAsReadPayload.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    // MARK: - CreateConversationPayload (Phase C)

    func test_createConversationPayload_encoding_directType() throws {
        let payload = CreateConversationPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000010",
            type: "direct",
            title: nil,
            participantIds: ["u-1", "u-2"]
        )
        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["type"] as? String, "direct")
        XCTAssertEqual(object["participantIds"] as? [String], ["u-1", "u-2"])
        // Swift's default synthesized Codable conformance OMITS nil
        // optionals from the JSON output — so `title` is absent when nil
        // rather than serialized as `null`. The gateway treats absent and
        // null identically for an optional field, so this is fine ; we
        // assert the absence here to lock the wire shape.
        XCTAssertNil(object["title"], "Expected nil title to be omitted from JSON output")
    }

    func test_createConversationPayload_encoding_withTitle() throws {
        let payload = CreateConversationPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000013",
            type: "group",
            title: "Team chat",
            participantIds: ["u-1", "u-2", "u-3"]
        )
        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["title"] as? String, "Team chat")
        XCTAssertEqual(object["type"] as? String, "group")
    }

    // MARK: - UpdateConversationPayload (Phase C)

    func test_updateConversationPayload_roundtrip_partialFields() throws {
        let original = UpdateConversationPayload(
            clientMutationId: ClientMutationId.generate(),
            conversationId: "conv-789",
            title: "New title",
            description: nil,
            avatarUrl: "https://cdn.example.com/avatar.jpg"
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(UpdateConversationPayload.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    // MARK: - UpdateSettingsPayload (Phase C — refactored shape)

    func test_updateSettingsPayload_carriesCategoryAndOpaqueBody() throws {
        let bodyJSON = #"{"showReadReceipts":true}"#
        let bodyData = try XCTUnwrap(bodyJSON.data(using: .utf8))
        let payload = UpdateSettingsPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000011",
            category: "privacy",
            body: bodyData
        )
        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["category"] as? String, "privacy")
        // `body` is base64-encoded when a Data is encoded via JSONEncoder
        // default strategy — this is fine because the dispatcher uses the
        // decoded Swift value, not the JSON wire form.
        XCTAssertNotNil(object["body"])
    }

    func test_updateSettingsPayload_roundtrip_preservesBodyBytes() throws {
        let bodyJSON = #"{"audioQuality":"high","extras":{}}"#
        let bodyData = try XCTUnwrap(bodyJSON.data(using: .utf8))
        let original = UpdateSettingsPayload(
            clientMutationId: ClientMutationId.generate(),
            category: "audio",
            body: bodyData
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(UpdateSettingsPayload.self, from: data)
        XCTAssertEqual(decoded.category, original.category)
        XCTAssertEqual(decoded.body, original.body)
        XCTAssertEqual(decoded.clientMutationId, original.clientMutationId)
    }

    // MARK: - CreatePostPayload (Phase C)

    func test_createPostPayload_roundtrip() throws {
        let original = CreatePostPayload(
            clientMutationId: ClientMutationId.generate(),
            content: "Hello world",
            attachmentIds: ["att-1"],
            visibility: "PUBLIC"
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(CreatePostPayload.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    /// U1b — an offline media post carries `localMediaPaths` + `originalLanguage`;
    /// both must survive the persisted-row roundtrip so the dispatcher can replay
    /// the TUS upload on reconnect.
    func test_createPostPayload_roundtrip_withLocalMediaPathsAndLanguage() throws {
        let original = CreatePostPayload(
            clientMutationId: ClientMutationId.generate(),
            content: "Photo post",
            attachmentIds: [],
            visibility: "PUBLIC",
            originalLanguage: "en",
            localMediaPaths: ["pending-media/abc.jpg", "pending-media/def.mp4"]
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(CreatePostPayload.self, from: data)
        XCTAssertEqual(decoded, original)
        XCTAssertEqual(decoded.localMediaPaths, ["pending-media/abc.jpg", "pending-media/def.mp4"])
        XCTAssertEqual(decoded.originalLanguage, "en")
    }

    /// A pre-U1b persisted row (no `localMediaPaths` key) must still decode, with
    /// the new optional defaulting to nil — no migration needed.
    func test_createPostPayload_decodesLegacyRowWithoutLocalMediaPaths() throws {
        let legacyJSON = """
        {"clientMutationId":"cmid_legacy","content":"old","attachmentIds":[],"visibility":"PUBLIC"}
        """
        let decoded = try decoder.decode(CreatePostPayload.self, from: Data(legacyJSON.utf8))
        XCTAssertNil(decoded.localMediaPaths)
        XCTAssertNil(decoded.originalLanguage)
        XCTAssertNil(decoded.type, "legacy row without a type key decodes as nil → gateway POST default")
        XCTAssertEqual(decoded.content, "old")
    }

    /// An offline REEL post persists its `type` so the dispatcher recreates it on
    /// the reels surface — the roundtrip must preserve it.
    func test_createPostPayload_roundtrip_withReelType() throws {
        let original = CreatePostPayload(
            clientMutationId: ClientMutationId.generate(),
            content: "My reel",
            attachmentIds: [],
            visibility: "PUBLIC",
            originalLanguage: "en",
            localMediaPaths: ["pending-media/clip.mp4"],
            type: "REEL"
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(CreatePostPayload.self, from: data)
        XCTAssertEqual(decoded, original)
        XCTAssertEqual(decoded.type, "REEL")
    }

    /// An offline STATUS (mood) carries its emoji + audience through the same
    /// `.createPost` row as posts — the roundtrip must preserve every field.
    func test_createPostPayload_roundtrip_withStatusFields() throws {
        let original = CreatePostPayload(
            clientMutationId: ClientMutationId.generate(),
            content: "Feeling good",
            attachmentIds: [],
            visibility: "ONLY",
            type: "STATUS",
            moodEmoji: "😎",
            audioUrl: "https://cdn/audio.m4a",
            audioDuration: 7,
            visibilityUserIds: ["u1", "u2"]
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(CreatePostPayload.self, from: data)
        XCTAssertEqual(decoded, original)
        XCTAssertEqual(decoded.moodEmoji, "😎")
        XCTAssertEqual(decoded.audioDuration, 7)
        XCTAssertEqual(decoded.visibilityUserIds, ["u1", "u2"])
    }

    /// A legacy `.createPost` row (no status fields) still decodes, with the new
    /// optionals defaulting to nil.
    func test_createPostPayload_decodesLegacyRowWithoutStatusFields() throws {
        let legacyJSON = """
        {"clientMutationId":"cmid_legacy2","content":"hi","attachmentIds":[],"visibility":"PUBLIC","type":"POST"}
        """
        let decoded = try decoder.decode(CreatePostPayload.self, from: Data(legacyJSON.utf8))
        XCTAssertNil(decoded.moodEmoji)
        XCTAssertNil(decoded.audioUrl)
        XCTAssertNil(decoded.audioDuration)
        XCTAssertNil(decoded.visibilityUserIds)
    }

    /// Task 17 — un envoi hors-ligne conserve sa position au flush : la charge
    /// d'outbox doit survivre au roundtrip JSON avec son `location`.
    func test_outboxPayload_survivesAFlushWithItsLocation() throws {
        let place = SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel")
        let payload = CreatePostPayload(
            clientMutationId: ClientMutationId.generate(),
            content: "ici",
            attachmentIds: [],
            visibility: "PUBLIC",
            location: place
        )
        let restored = try decoder.decode(CreatePostPayload.self, from: try encoder.encode(payload))
        XCTAssertEqual(restored.location?.name, "Tour Eiffel")
        XCTAssertEqual(restored, payload)
    }

    /// Une ligne persistée avant Task 17 (pas de clé `location`) doit continuer
    /// à décoder — sinon toutes les créations de post déjà en file échouent au
    /// redémarrage de l'app.
    func test_createPostPayload_decodesLegacyRowWithoutLocation() throws {
        let legacyJSON = """
        {"clientMutationId":"cmid_legacy3","content":"hi","attachmentIds":[],"visibility":"PUBLIC"}
        """
        let decoded = try decoder.decode(CreatePostPayload.self, from: Data(legacyJSON.utf8))
        XCTAssertNil(decoded.location)
    }

    /// Spec 2026-08-02 §2 — le CONSENTEMENT de découvrabilité doit survivre au
    /// flush exactement comme `location`.
    ///
    /// Un post TEXTE + lieu, le cas nominal de cette fonctionnalité, ne passe
    /// PAS par `PostService.create` : `FeedViewModel.createPost` le range dans
    /// la file durable (`isDurableTextOnly`). Sans cette clé, l'utilisateur
    /// coche « trouvable à proximité », voit sa publication partir, et le
    /// consentement disparaît au flush — silencieusement, même en ligne.
    func test_outboxPayload_survivesAFlushWithItsDiscoverabilityPrecision() throws {
        let payload = CreatePostPayload(
            clientMutationId: ClientMutationId.generate(),
            content: "ici",
            attachmentIds: [],
            visibility: "PUBLIC",
            location: SharedPlace(latitude: 48.8583736, longitude: 2.2944813, name: "Tour Eiffel"),
            discoverabilityPrecision: .neighborhood
        )

        let restored = try decoder.decode(CreatePostPayload.self, from: try encoder.encode(payload))

        XCTAssertEqual(restored.discoverabilityPrecision, .neighborhood)
        XCTAssertEqual(restored, payload)
    }

    /// L'ABSENCE vaut « non découvrable » : une charge sans consentement ne
    /// doit pas fabriquer de palier par défaut au décodage.
    func test_createPostPayload_withoutDiscoverabilityPrecision_staysNil() throws {
        let payload = CreatePostPayload(
            clientMutationId: ClientMutationId.generate(),
            content: "hi",
            attachmentIds: [],
            visibility: "PUBLIC"
        )

        let restored = try decoder.decode(CreatePostPayload.self, from: try encoder.encode(payload))

        XCTAssertNil(restored.discoverabilityPrecision)
    }

    /// Une ligne persistée avant ce champ décode toujours — aucune migration.
    func test_createPostPayload_decodesLegacyRowWithoutDiscoverabilityPrecision() throws {
        let legacyJSON = """
        {"clientMutationId":"cmid_legacy4","content":"hi","attachmentIds":[],"visibility":"PUBLIC"}
        """
        let decoded = try decoder.decode(CreatePostPayload.self, from: Data(legacyJSON.utf8))
        XCTAssertNil(decoded.discoverabilityPrecision)
    }

    // MARK: - ToggleLikePostPayload (Phase C)

    func test_toggleLikePostPayload_encodes_likedBool() throws {
        let payload = ToggleLikePostPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000012",
            postId: "post-1",
            liked: true
        )
        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["liked"] as? Bool, true)
        XCTAssertEqual(object["postId"] as? String, "post-1")
    }

    /// Une réaction à une story emprunte le MÊME endpoint que le like d'un post
    /// (`POST /posts/:id/like`) et le même `kind` de `MutationLog` côté gateway
    /// (`toggleLikePost`) : pas d'`OutboxKind` à elle, mais l'emoji doit
    /// voyager jusqu'au dispatcher.
    func test_toggleLikePostPayload_withReactionEmoji_roundTripsTheEmoji() throws {
        let payload = ToggleLikePostPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000013",
            postId: "story-1",
            liked: true,
            emoji: "🔥"
        )

        let decoded = try decoder.decode(ToggleLikePostPayload.self, from: try encoder.encode(payload))

        XCTAssertEqual(decoded.emoji, "🔥")
        XCTAssertEqual(decoded, payload)
    }

    /// Un like simple garde la forme qu'il avait avant ce champ : la clé ne
    /// part pas, plutôt qu'un `null` que le dispatcher aurait à interpréter.
    func test_toggleLikePostPayload_withoutEmoji_omitsTheEmojiKey() throws {
        let payload = ToggleLikePostPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000014",
            postId: "post-1",
            liked: false
        )

        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(object["emoji"])
        XCTAssertEqual(Set(object.keys), ["clientMutationId", "postId", "liked"])
    }

    /// Rétro-compatibilité : les lignes DÉJÀ en file au moment de la migration
    /// ont été encodées sans `emoji`. Elles doivent continuer à se décoder —
    /// sinon la mise à jour ferait perdre des mutations en attente.
    func test_toggleLikePostPayload_decodesRowsWrittenBeforeTheEmojiField_asPlainLike() throws {
        let legacy = Data("""
        {"clientMutationId":"cmid_00000000-0000-4000-8000-000000000012","postId":"post-1","liked":true}
        """.utf8)

        let decoded = try decoder.decode(ToggleLikePostPayload.self, from: legacy)

        XCTAssertNil(decoded.emoji, "Un like simple n'a pas d'emoji.")
        XCTAssertTrue(decoded.liked)
        XCTAssertEqual(decoded.postId, "post-1")
    }

    // MARK: - CreateCommentPayload (Phase C)

    func test_createCommentPayload_roundtrip_topLevel() throws {
        let original = CreateCommentPayload(
            clientMutationId: ClientMutationId.generate(),
            postId: "post-1",
            parentCommentId: nil,
            content: "Great post!"
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(CreateCommentPayload.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func test_createCommentPayload_roundtrip_reply() throws {
        let original = CreateCommentPayload(
            clientMutationId: ClientMutationId.generate(),
            postId: "post-1",
            parentCommentId: "comment-parent",
            content: "Agreed"
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(CreateCommentPayload.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func test_createCommentPayload_roundtrip_withEffectFlags() throws {
        let original = CreateCommentPayload(
            clientMutationId: ClientMutationId.generate(),
            postId: "post-1",
            parentCommentId: "comment-parent",
            content: "Sparkles",
            effectFlags: 5
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(CreateCommentPayload.self, from: data)
        XCTAssertEqual(decoded, original)
        XCTAssertEqual(decoded.effectFlags, 5)
    }

    /// Une ligne persistée avant l'ajout d'`effectFlags` doit continuer à
    /// décoder — sinon tous les commentaires déjà en file échouent au
    /// redémarrage de l'app.
    func test_createCommentPayload_decodesLegacyRowWithoutEffectFlags() throws {
        let legacyJSON = """
        {"clientMutationId":"cmid_legacy4","postId":"post-1","content":"hi"}
        """
        let decoded = try decoder.decode(CreateCommentPayload.self, from: Data(legacyJSON.utf8))
        XCTAssertNil(decoded.effectFlags)
        XCTAssertNil(decoded.parentCommentId)
    }

    // MARK: - DeleteCommentPayload (Phase C)

    func test_deleteCommentPayload_roundtrip() throws {
        let original = DeleteCommentPayload(
            clientMutationId: ClientMutationId.generate(),
            commentId: "comment-xyz"
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(DeleteCommentPayload.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    // MARK: - ToggleLikeCommentPayload (Phase C)

    func test_toggleLikeCommentPayload_roundtrip_both_directions() throws {
        for liked in [true, false] {
            let original = ToggleLikeCommentPayload(
                clientMutationId: ClientMutationId.generate(),
                commentId: "comment-\(liked)",
                liked: liked
            )
            let data = try encoder.encode(original)
            let decoded = try decoder.decode(ToggleLikeCommentPayload.self, from: data)
            XCTAssertEqual(decoded, original)
        }
    }

    // MARK: - RepostPostPayload (fil rouge du repost, lot 7 tâche 7.5)

    /// `targetType` voyage OBLIGATOIRE (Loi 5 — « le repost miroite »),
    /// jamais optionnel : la clé DOIT figurer sur le fil, pas seulement
    /// exister à l'appel.
    func test_repostPostPayload_encoding_includesPostIdAndTargetType() throws {
        let payload = RepostPostPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000002",
            postId: "post-source-1",
            targetType: "POST"
        )

        let data = try encoder.encode(payload)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["postId"] as? String, "post-source-1")
        XCTAssertEqual(object["targetType"] as? String, "POST")
        XCTAssertNotNil(object["isQuote"], "isQuote a un défaut mémoire mais reste ENCODÉ — pas de clé absente")
    }

    func test_repostPostPayload_roundtrip_withQuoteAndVisibility() throws {
        let original = RepostPostPayload(
            clientMutationId: ClientMutationId.generate(),
            postId: "post-source-2",
            targetType: "STORY",
            content: "Regardez ça",
            isQuote: true,
            visibility: "COMMUNITY"
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(RepostPostPayload.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func test_repostPostPayload_roundtrip_defaultsSimpleRepost() throws {
        let original = RepostPostPayload(
            clientMutationId: ClientMutationId.generate(),
            postId: "post-source-3",
            targetType: "POST"
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(RepostPostPayload.self, from: data)
        XCTAssertEqual(decoded, original)
        XCTAssertNil(decoded.content)
        XCTAssertFalse(decoded.isQuote)
        XCTAssertNil(decoded.visibility)
    }
}
