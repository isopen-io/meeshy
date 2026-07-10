import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - OutboxDispatcherTests

/// Tests the locally-decidable dispatch paths — no network calls required.
///
/// Each case exercises a branch that terminates before reaching the network:
///   • .publishStory / .repostStory  → permanent NSError 501 (wrong queue)
///   • .sendMessage / .editMessage / .deleteMessage / .sendReaction
///     with corrupt payload            → silent drop (flusher removes row)
///   • .sendMessage with unknown id prefix → silent drop (stale row)
///   • All other kinds with corrupt payload → NSError 400 (decodePayload wraps)
///   • .deleteComment / .toggleLikeComment with sentinel conversationId → silent drop
final class OutboxDispatcherTests: XCTestCase {

    // MARK: - Factories

    private func makeSUT() -> OutboxDispatcher { OutboxDispatcher() }

    private func makeRecord(
        kind: OutboxKind,
        payload: Data,
        id: String = UUID().uuidString,
        conversationId: String = "conv-abc"
    ) -> OutboxRecord {
        OutboxRecord(
            id: id,
            kind: kind,
            conversationId: conversationId,
            clientMessageId: "cid-\(UUID().uuidString)",
            payload: payload
        )
    }

    private func encode<T: Encodable>(_ value: T) -> Data {
        // Force-unwrap: test data is always encodable.
        try! JSONEncoder().encode(value)
    }

    private var corrupt: Data { Data("not-valid-json".utf8) }

    // MARK: - publishStory / repostStory → NSError 501

    func test_dispatch_whenKindIsPublishStory_throwsCode501() async {
        let record = makeRecord(kind: .publishStory, payload: Data())
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected dispatch to throw code 501 for .publishStory")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 501)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func test_dispatch_whenKindIsRepostStory_throwsCode501() async {
        let record = makeRecord(kind: .repostStory, payload: Data())
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected dispatch to throw code 501 for .repostStory")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 501)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - sendMessage: unknown id prefix → silent drop

    func test_dispatch_sendMessage_whenIdHasUnknownPrefix_dropsWithoutThrowing() async {
        let record = makeRecord(kind: .sendMessage, payload: Data(), id: "xyz_stale-row")
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for unknown id prefix, got: \(error)")
        }
    }

    // MARK: - sendMessage: corrupt ofq_ payload → silent drop

    func test_dispatch_sendMessage_whenOfqPrefixAndCorruptPayload_dropsWithoutThrowing() async {
        let record = makeRecord(kind: .sendMessage, payload: corrupt, id: "ofq_bad-payload")
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for corrupt ofq_ payload, got: \(error)")
        }
    }

    // MARK: - sendMessage: corrupt mrq_ payload → silent drop

    func test_dispatch_sendMessage_whenMrqPrefixAndCorruptPayload_dropsWithoutThrowing() async {
        let record = makeRecord(kind: .sendMessage, payload: corrupt, id: "mrq_bad-payload")
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for corrupt mrq_ payload, got: \(error)")
        }
    }

    // MARK: - sendMessage: mrq_ with nil clientMessageId → silent drop

    func test_dispatch_sendMessage_whenMrqPrefixAndNilClientMessageId_dropsWithoutThrowing() async {
        // Valid LegacyMrqPayload shape but clientMessageId absent → decodes to nil
        // → guard let clientMessageId = item.clientMessageId fails → return
        let json = Data(#"{"conversationId":"c1","content":"hello"}"#.utf8)
        let record = makeRecord(kind: .sendMessage, payload: json, id: "mrq_no-cmid")
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for nil clientMessageId, got: \(error)")
        }
    }

    // MARK: - editMessage: corrupt payload → silent drop

    func test_dispatch_editMessage_whenCorruptPayload_dropsWithoutThrowing() async {
        let record = makeRecord(kind: .editMessage, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for corrupt OfflineEditPayload, got: \(error)")
        }
    }

    // MARK: - deleteMessage: corrupt payload → silent drop

    func test_dispatch_deleteMessage_whenCorruptPayload_dropsWithoutThrowing() async {
        let record = makeRecord(kind: .deleteMessage, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for corrupt OfflineDeletePayload, got: \(error)")
        }
    }

    // MARK: - sendReaction: corrupt payload → silent drop

    func test_dispatch_sendReaction_whenCorruptPayload_dropsWithoutThrowing() async {
        let record = makeRecord(kind: .sendReaction, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for corrupt ReactionOutboxPayload, got: \(error)")
        }
    }

    // MARK: - markAsRead: corrupt payload → NSError 400

    func test_dispatch_markAsRead_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .markAsRead, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt markAsRead payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - blockUser: corrupt payload → NSError 400

    func test_dispatch_blockUser_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .blockUser, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt blockUser payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - unblockUser: corrupt payload → NSError 400

    func test_dispatch_unblockUser_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .unblockUser, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt unblockUser payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - sendFriendRequest: corrupt payload → NSError 400

    func test_dispatch_sendFriendRequest_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .sendFriendRequest, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt sendFriendRequest payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - respondFriendRequest: corrupt payload → NSError 400

    func test_dispatch_respondFriendRequest_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .respondFriendRequest, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt respondFriendRequest payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - updateProfile: corrupt payload → NSError 400

    func test_dispatch_updateProfile_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .updateProfile, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt updateProfile payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - createConversation: corrupt payload → NSError 400

    func test_dispatch_createConversation_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .createConversation, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt createConversation payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - updateConversation: corrupt payload → NSError 400

    func test_dispatch_updateConversation_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .updateConversation, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt updateConversation payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - updateSettings: corrupt payload → NSError 400

    func test_dispatch_updateSettings_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .updateSettings, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt updateSettings payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - createPost: corrupt payload → NSError 400

    func test_dispatch_createPost_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .createPost, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt createPost payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - toggleLikePost: corrupt payload → NSError 400

    func test_dispatch_toggleLikePost_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .toggleLikePost, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt toggleLikePost payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - createComment: corrupt payload → NSError 400

    func test_dispatch_createComment_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .createComment, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt createComment payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - deleteComment: corrupt payload → NSError 400

    func test_dispatch_deleteComment_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .deleteComment, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt deleteComment payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - deleteComment: valid payload but sentinel conversationId → silent drop

    func test_dispatch_deleteComment_whenSentinelConversationId_dropsWithoutThrowing() async {
        // The dispatcher reads conversationId from the record (not from DeleteCommentPayload)
        // to reconstruct the gateway path. The sentinel "_global" means no postId was
        // available at enqueue time — dispatcher logs an error and returns without a
        // network call.
        let payload = encode(DeleteCommentPayload(
            clientMutationId: "cmid-dc-\(UUID().uuidString)",
            commentId: "comment-1"
        ))
        let record = makeRecord(
            kind: .deleteComment,
            payload: payload,
            conversationId: OfflineQueue.globalConversationSentinel
        )
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for sentinel conversationId in deleteComment, got: \(error)")
        }
    }

    // MARK: - toggleLikeComment: corrupt payload → NSError 400

    func test_dispatch_toggleLikeComment_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .toggleLikeComment, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected NSError 400 for corrupt toggleLikeComment payload")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - toggleLikeComment: valid payload but sentinel conversationId → silent drop

    func test_dispatch_toggleLikeComment_whenSentinelConversationId_dropsWithoutThrowing() async {
        let payload = encode(ToggleLikeCommentPayload(
            clientMutationId: "cmid-tlc-\(UUID().uuidString)",
            commentId: "comment-2",
            liked: true
        ))
        let record = makeRecord(
            kind: .toggleLikeComment,
            payload: payload,
            conversationId: OfflineQueue.globalConversationSentinel
        )
        do {
            try await makeSUT().dispatch(record)
        } catch {
            XCTFail("Expected silent drop for sentinel conversationId in toggleLikeComment, got: \(error)")
        }
    }
}
