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
            upToMessageId: "msg-456"
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
}
