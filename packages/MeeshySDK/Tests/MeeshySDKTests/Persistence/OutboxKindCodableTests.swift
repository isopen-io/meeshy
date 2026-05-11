import XCTest
@testable import MeeshySDK

/// Wave 1 Task 3.2 — Codable round-trip for every new mutation payload and
/// raw-value stability checks for `OutboxKind`.
///
/// Each payload struct MUST embed `clientMutationId` (the dedup key shared
/// with the gateway `MutationLog` row, Task 3.3) and round-trip through JSON
/// without losing data. The raw-value lock prevents anyone from renaming an
/// enum case and silently breaking persisted outbox rows on existing devices.
final class OutboxKindCodableTests: XCTestCase {

    // MARK: - Enum surface

    func test_allKindsCount_isAtLeast18() {
        XCTAssertGreaterThanOrEqual(
            OutboxKind.allCases.count, 18,
            "Expected 4 existing + 14 new = 18+ kinds, got \(OutboxKind.allCases.count)"
        )
    }

    func test_outboxKind_rawValue_isStable() {
        // Persistence layer relies on raw values (outbox row `kind` column).
        // Lock them down — renaming a case is a migration, not a refactor.
        let expected: Set<String> = [
            "sendMessage", "sendReaction", "editMessage", "deleteMessage",
            "markAsRead", "sendFriendRequest", "respondFriendRequest",
            "blockUser", "unblockUser", "createConversation",
            "updateConversation", "updateProfile", "updateSettings",
            "publishStory", "repostStory", "createPost",
            "toggleLikePost", "createComment", "deleteComment",
            "toggleLikeComment"
        ]
        let actual = Set(OutboxKind.allCases.map(\.rawValue))
        XCTAssertTrue(
            expected.isSubset(of: actual),
            "Missing kinds: \(expected.subtracting(actual))"
        )
    }

    // MARK: - Payload round-trips

    /// Helper: encode + decode and re-encode, asserting byte-equality on the
    /// second encoding. Catches drift between custom `CodingKeys` and the
    /// auto-synthesized impl that would silently corrupt persisted rows.
    private func roundTrip<T: Codable & Equatable>(_ value: T) throws -> T {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let decoder = JSONDecoder()
        let data = try encoder.encode(value)
        let decoded = try decoder.decode(T.self, from: data)
        let reEncoded = try encoder.encode(decoded)
        XCTAssertEqual(data, reEncoded, "Round-trip not byte-stable for \(T.self)")
        return decoded
    }

    func test_markAsRead_roundTrips() throws {
        let p = MarkAsReadPayload(
            clientMutationId: "cmid_x",
            conversationId: "c1",
            upToMessageId: "m1"
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.clientMutationId, "cmid_x")
        XCTAssertEqual(d.conversationId, "c1")
        XCTAssertEqual(d.upToMessageId, "m1")
    }

    func test_sendFriendRequest_roundTrips() throws {
        let p = SendFriendRequestPayload(clientMutationId: "cmid_fr", targetUserId: "u1")
        let d = try roundTrip(p)
        XCTAssertEqual(d.targetUserId, "u1")
    }

    func test_respondFriendRequest_roundTrips() throws {
        let p = RespondFriendRequestPayload(
            clientMutationId: "cmid_rfr",
            friendRequestId: "fr1",
            action: .accept
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.action, .accept)
        let reject = RespondFriendRequestPayload(
            clientMutationId: "cmid_rfr2",
            friendRequestId: "fr2",
            action: .reject
        )
        let dr = try roundTrip(reject)
        XCTAssertEqual(dr.action, .reject)
    }

    func test_blockUser_roundTrips() throws {
        let p = BlockUserPayload(clientMutationId: "cmid_b", targetUserId: "u")
        let d = try roundTrip(p)
        XCTAssertEqual(d.targetUserId, "u")
    }

    func test_unblockUser_roundTrips() throws {
        let p = UnblockUserPayload(clientMutationId: "cmid_ub", targetUserId: "u")
        let d = try roundTrip(p)
        XCTAssertEqual(d.targetUserId, "u")
    }

    func test_createConversation_roundTrips() throws {
        let p = CreateConversationPayload(
            clientMutationId: "cmid_cc",
            type: "group",
            title: "Team",
            participantIds: ["u1", "u2", "u3"]
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.type, "group")
        XCTAssertEqual(d.title, "Team")
        XCTAssertEqual(d.participantIds, ["u1", "u2", "u3"])
    }

    func test_updateConversation_roundTrips() throws {
        let p = UpdateConversationPayload(
            clientMutationId: "cmid_uc",
            conversationId: "c1",
            title: "Renamed",
            description: nil,
            avatarUrl: "https://x/a.png"
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.title, "Renamed")
        XCTAssertNil(d.description)
        XCTAssertEqual(d.avatarUrl, "https://x/a.png")
    }

    func test_updateProfile_roundTrips() throws {
        let p = UpdateProfilePayload(
            clientMutationId: "cmid_up",
            displayName: "Alice",
            bio: nil,
            avatarUrl: nil
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.displayName, "Alice")
    }

    func test_updateSettings_roundTrips() throws {
        let p = UpdateSettingsPayload(
            clientMutationId: "cmid_us",
            language: "fr",
            regionalLanguage: "es",
            customDestinationLanguage: nil,
            notificationsEnabled: true,
            isPrivate: false
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.language, "fr")
        XCTAssertEqual(d.regionalLanguage, "es")
        XCTAssertEqual(d.notificationsEnabled, true)
        XCTAssertEqual(d.isPrivate, false)
    }

    func test_publishStory_roundTrips() throws {
        let p = PublishStoryPayload(
            clientMutationId: "cmid_ps",
            offlineQueueItemId: "ofq-1"
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.offlineQueueItemId, "ofq-1")
    }

    func test_repostStory_roundTrips() throws {
        let p = RepostStoryPayload(
            clientMutationId: "cmid_rs",
            originalStoryId: "s1",
            targetConversationId: "c1"
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.originalStoryId, "s1")
        XCTAssertEqual(d.targetConversationId, "c1")
    }

    func test_createPost_roundTrips() throws {
        let p = CreatePostPayload(
            clientMutationId: "cmid_cp",
            content: "hello",
            attachmentIds: ["a1"],
            visibility: "friends"
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.content, "hello")
        XCTAssertEqual(d.attachmentIds, ["a1"])
        XCTAssertEqual(d.visibility, "friends")
    }

    func test_toggleLikePost_roundTrips() throws {
        let p = ToggleLikePostPayload(
            clientMutationId: "cmid_tlp",
            postId: "p1",
            liked: true
        )
        let d = try roundTrip(p)
        XCTAssertTrue(d.liked)
    }

    func test_createComment_roundTrips() throws {
        let p = CreateCommentPayload(
            clientMutationId: "cmid_cm",
            postId: "p1",
            parentCommentId: nil,
            content: "first!"
        )
        let d = try roundTrip(p)
        XCTAssertEqual(d.content, "first!")
        XCTAssertNil(d.parentCommentId)
    }

    func test_deleteComment_roundTrips() throws {
        let p = DeleteCommentPayload(clientMutationId: "cmid_dc", commentId: "c1")
        let d = try roundTrip(p)
        XCTAssertEqual(d.commentId, "c1")
    }

    func test_toggleLikeComment_roundTrips() throws {
        let p = ToggleLikeCommentPayload(
            clientMutationId: "cmid_tlc",
            commentId: "c1",
            liked: false
        )
        let d = try roundTrip(p)
        XCTAssertFalse(d.liked)
    }
}
