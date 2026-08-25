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
///   • All other kinds with corrupt payload → MeeshyError.server(400, _) (decodePayload wraps)
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
        // `.iso8601` matches `OutboxDispatcher.decoder` AND the real
        // persistence encoder (`OfflineQueue.swift`) — a default JSONEncoder
        // here would silently corrupt `OfflineQueueItem.createdAt` (encoded
        // as a Double, decoded as ISO8601 string), sending every OfflineQueueItem
        // fixture down the "corrupt payload, drop" branch instead of the
        // branch under test. Force-unwrap: test data is always encodable.
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try! encoder.encode(value)
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

    // MARK: - sendMessage: fan-out copy with an unresolved origin → typed deferral error (round 1 fix, Critical)

    /// Round 1 de revue (Critical) — le dispatcher doit lever une erreur
    /// TYPÉE (`OutboxDeferralError.waitingForFanoutOrigin`), pas un `NSError`
    /// générique : c'est ce qui permet à `OutboxFlusher` de reconnaître le
    /// cas et de replanifier la ligne SANS consommer `attempts` (voir
    /// `OutboxFlusherTests
    /// .test_flush_waitingForFanoutOrigin_doesNotConsumeRetryBudget_norExhaust`).
    /// Un identifiant d'origine jamais vu de `resolveServerId` résout
    /// toujours `nil` — exactement l'état d'une origine pas encore acquittée.
    func test_dispatch_sendMessage_fanoutCopyWithUnresolvedOrigin_throwsTypedDeferralError() async {
        let unresolvedOriginId = "cid_never_acknowledged_\(UUID().uuidString)"
        let item = OfflineQueueItem(
            id: "qid-fanout-wait",
            clientMessageId: "cid-fanout-wait",
            conversationId: "conv-abc",
            content: "photo de vacances",
            originalLanguage: nil,
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil,
            localAudioPath: nil,
            copyAttachmentsFromClientMessageId: unresolvedOriginId,
            createdAt: Date()
        )
        let record = makeRecord(kind: .sendMessage, payload: encode(item), id: "ofq_fanout-wait")

        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected OutboxDeferralError.waitingForFanoutOrigin while the origin is unresolved")
        } catch OutboxDeferralError.waitingForFanoutOrigin(let clientMessageId) {
            XCTAssertEqual(clientMessageId, unresolvedOriginId)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - sendMessage: fan-out copy carrying local media → NSError 501 (round 1 fix, Important 3)

    /// Round 1 de revue (Important 3) — `sendWithAttachmentsAsync` (donc les
    /// deux branches socket de rejeu média/audio hors-ligne) n'a AUCUN moyen
    /// de transmettre `copyAttachmentsFromMessageId`, et le handler gateway
    /// `handleMessageSendWithAttachments` ne le lit pas non plus. Aucune
    /// cible non-origine ne porte de média local aujourd'hui
    /// (`SharePendingSendConsumer.enqueue`), donc cette combinaison n'arrive
    /// jamais en pratique — mais rien ne l'empêchait STRUCTURELLEMENT, et le
    /// champ aurait disparu EN SILENCE. Le dispatcher échoue fort à la place.
    func test_dispatch_sendMessage_withLocalMediaAndFanoutCopy_throwsCode501() async {
        let item = OfflineQueueItem(
            id: "qid-fanout-media",
            clientMessageId: "cid-fanout-media",
            conversationId: "conv-abc",
            content: "",
            originalLanguage: nil,
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil,
            localAudioPath: nil,
            localMediaPaths: ["pending-media/cid-fanout-media/0.jpg"],
            copyAttachmentsFromClientMessageId: "cid_origin",
            createdAt: Date()
        )
        let record = makeRecord(kind: .sendMessage, payload: encode(item), id: "ofq_fanout-media")

        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected dispatch to throw code 501 for local media + fan-out copy")
        } catch let error as NSError {
            XCTAssertEqual(error.domain, "OutboxDispatcher")
            XCTAssertEqual(error.code, 501)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - sendMessage: fan-out copy carrying local AUDIO → NSError 501 (round 2 fix, Minor)

    /// Round 2 de revue (Minor) — même garde 501 que le test ci-dessus, mais
    /// sur la branche AUDIO (`localAudioPath`/`localAudioPaths`) : le
    /// garde-fou est placé une seule fois AVANT les deux `if` (couverture
    /// structurelle des deux chemins socket), mais seule la branche média
    /// visuelle était exercée par un test avant ce round. `localAudioPath`
    /// (scalaire) suffit à emprunter la branche — pas besoin du tableau
    /// `localAudioPaths` pour la même garde.
    func test_dispatch_sendMessage_withLocalAudioAndFanoutCopy_throwsCode501() async {
        let item = OfflineQueueItem(
            id: "qid-fanout-audio",
            clientMessageId: "cid-fanout-audio",
            conversationId: "conv-abc",
            content: "",
            originalLanguage: nil,
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil,
            localAudioPath: "pending-audio/cid-fanout-audio.m4a",
            copyAttachmentsFromClientMessageId: "cid_origin",
            createdAt: Date()
        )
        let record = makeRecord(kind: .sendMessage, payload: encode(item), id: "ofq_fanout-audio")

        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected dispatch to throw code 501 for local audio + fan-out copy")
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

    // MARK: - markAsRead: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_markAsRead_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .markAsRead, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt markAsRead payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - blockUser: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_blockUser_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .blockUser, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt blockUser payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - unblockUser: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_unblockUser_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .unblockUser, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt unblockUser payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - sendFriendRequest: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_sendFriendRequest_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .sendFriendRequest, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt sendFriendRequest payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - respondFriendRequest: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_respondFriendRequest_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .respondFriendRequest, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt respondFriendRequest payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - updateProfile: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_updateProfile_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .updateProfile, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt updateProfile payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - createConversation: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_createConversation_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .createConversation, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt createConversation payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - updateConversation: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_updateConversation_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .updateConversation, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt updateConversation payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - updateSettings: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_updateSettings_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .updateSettings, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt updateSettings payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - createPost: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_createPost_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .createPost, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt createPost payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - toggleLikePost: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_toggleLikePost_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .toggleLikePost, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt toggleLikePost payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - repostPost: corrupt payload → MeeshyError.server(400, _)
    // (fil rouge du repost, lot 7 tâche 7.5)

    func test_dispatch_repostPost_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .repostPost, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt repostPost payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    /// `.repostPost` a désormais son PROPRE branchement, distinct de
    /// `.publishStory, .repostStory` — sans ce test, une régression qui
    /// fusionnerait à nouveau les trois cases dans le même 501 passerait
    /// inaperçue (la garde de compilation ne voit qu'un `case` manquant,
    /// jamais qu'un `case` existe mais route au mauvais endroit).
    func test_dispatch_whenKindIsRepostPost_doesNotThrowCode501() async {
        let record = makeRecord(kind: .repostPost, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected a decode failure (400), not a silent success")
        } catch let error as NSError where error.domain == "OutboxDispatcher" {
            XCTAssertNotEqual(error.code, 501, "repostPost must not fall through to the story-queue 501 branch")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - createComment: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_createComment_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .createComment, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt createComment payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - deleteComment: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_deleteComment_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .deleteComment, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt deleteComment payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
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

    // MARK: - toggleLikeComment: corrupt payload → MeeshyError.server(400, _)

    func test_dispatch_toggleLikeComment_whenCorruptPayload_throwsCode400() async {
        let record = makeRecord(kind: .toggleLikeComment, payload: corrupt)
        do {
            try await makeSUT().dispatch(record)
            XCTFail("Expected MeeshyError.server(400, _) for corrupt toggleLikeComment payload")
        } catch MeeshyError.server(let statusCode, _) {
            XCTAssertEqual(statusCode, 400)
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
