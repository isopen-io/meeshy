import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

// MARK: - Tests

@MainActor
final class ConversationCommandHandlerTests: XCTestCase {

    private let conversationId = "000000000000000000000099"
    private let currentUserId = "000000000000000000000001"
    private let otherUserId = "000000000000000000000002"

    // MARK: - Factory

    private func makeSUT(
        messageService: MockMessageService = MockMessageService()
    ) throws -> (
        sut: ConversationCommandHandler,
        state: ConversationStateStore,
        messageService: MockMessageService,
        persistence: MessagePersistenceActor
    ) {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        let persistence = MessagePersistenceActor(dbWriter: db)
        let state = ConversationStateStore()
        let sut = ConversationCommandHandler(
            state: state,
            conversationId: conversationId,
            messageService: messageService,
            persistence: persistence
        )
        return (sut, state, messageService, persistence)
    }

    private func makeMessage(
        id: String = "msg1",
        senderId: String? = nil,
        isMe: Bool = false,
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: id,
            conversationId: conversationId,
            senderId: senderId ?? (isMe ? currentUserId : otherUserId),
            content: "Test message",
            createdAt: createdAt,
            updatedAt: createdAt,
            deliveryStatus: Message.DeliveryStatus.sent,
            isMe: isMe
        )
    }

    // MARK: - canDeleteForEveryone

    func test_canDeleteForEveryone_ownMessageWithinWindow_returnsTrue() throws {
        let (sut, _, _, _) = try makeSUT()
        let recentOwnMessage = makeMessage(isMe: true, createdAt: Date())

        XCTAssertTrue(sut.canDeleteForEveryone(recentOwnMessage),
            "Recent own message must be deletable by everyone")
    }

    func test_canDeleteForEveryone_ownMessageOlderThanWindow_returnsFalse() throws {
        let (sut, _, _, _) = try makeSUT()
        let oldTimestamp = Date().addingTimeInterval(-(2 * 3600 + 1))
        let expiredOwnMessage = makeMessage(isMe: true, createdAt: oldTimestamp)

        XCTAssertFalse(sut.canDeleteForEveryone(expiredOwnMessage),
            "Own message older than the 2-hour window must not be deletable by everyone")
    }

    func test_canDeleteForEveryone_otherUserMessage_returnsFalse() throws {
        let (sut, _, _, _) = try makeSUT()
        let otherMessage = makeMessage(isMe: false, createdAt: Date())

        XCTAssertFalse(sut.canDeleteForEveryone(otherMessage),
            "Other user's message must never be deletable by everyone from this client")
    }

    func test_canDeleteForEveryone_ownMessageExactlyAtWindowBoundary_returnsTrue() throws {
        let (sut, _, _, _) = try makeSUT()
        let nearBoundaryTimestamp = Date().addingTimeInterval(-(2 * 3600 - 1))
        let boundaryMessage = makeMessage(isMe: true, createdAt: nearBoundaryTimestamp)

        XCTAssertTrue(sut.canDeleteForEveryone(boundaryMessage),
            "Own message within 1 second of the 2-hour boundary must still be deletable")
    }

    func test_canDeleteForEveryone_customWindow_respectsOverride() throws {
        let (sut, _, _, _) = try makeSUT()
        let oneHourAgo = Date().addingTimeInterval(-3600)
        let message = makeMessage(isMe: true, createdAt: oneHourAgo)

        XCTAssertFalse(sut.canDeleteForEveryone(message, window: 1800),
            "Own message outside the custom 30-minute window must not be deletable")
        XCTAssertTrue(sut.canDeleteForEveryone(message, window: 7200),
            "Own message inside the custom 2-hour window must be deletable")
    }

    // MARK: - consumeViewOnce

    func test_consumeViewOnce_success_returnsTrue() async throws {
        let mockService = MockMessageService()
        let (sut, _, _, _) = try makeSUT(messageService: mockService)

        let result = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertTrue(result, "consumeViewOnce must return true on successful API call")
    }

    func test_consumeViewOnce_success_callsServiceWithCorrectParams() async throws {
        let mockService = MockMessageService()
        let (sut, _, _, _) = try makeSUT(messageService: mockService)

        _ = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertEqual(mockService.consumeViewOnceCallCount, 1,
            "consumeViewOnce must call the message service exactly once")
    }

    func test_consumeViewOnce_failure_returnsFalse() async throws {
        let mockService = MockMessageService()
        mockService.consumeViewOnceResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _) = try makeSUT(messageService: mockService)

        let result = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertFalse(result, "consumeViewOnce must return false when the API call fails")
    }

    func test_consumeViewOnce_failure_setsStateError() async throws {
        let mockService = MockMessageService()
        mockService.consumeViewOnceResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))
        let (sut, state, _, _) = try makeSUT(messageService: mockService)

        _ = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertNotNil(state.error, "consumeViewOnce failure must surface an error message in state")
    }

    func test_consumeViewOnce_success_doesNotSetStateError() async throws {
        let mockService = MockMessageService()
        let (sut, state, _, _) = try makeSUT(messageService: mockService)

        _ = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertNil(state.error, "consumeViewOnce success must not set an error on state")
    }

    // MARK: - Rig (commandes d'un message)

    private final class TestClock {
        var now = Date(timeIntervalSince1970: 1_000)
    }

    private struct Rig {
        let sut: ConversationCommandHandler
        let persistence: MockConversationCommandPersistence
        let service: MockMessageService
        let queue: FakeOfflineMessageQueue
        let network: FakeNetworkMonitor
        let outbox: MockReactionOutbox
        let attachments: MockAttachmentDeleting
        let clock: TestClock
    }

    private func makeRig(isOnline: Bool = true) -> Rig {
        let persistence = MockConversationCommandPersistence()
        let service = MockMessageService()
        let queue = FakeOfflineMessageQueue()
        let network = FakeNetworkMonitor(isOnline: isOnline)
        let outbox = MockReactionOutbox()
        let attachments = MockAttachmentDeleting()
        let clock = TestClock()
        let sut = ConversationCommandHandler(
            state: ConversationStateStore(),
            conversationId: conversationId,
            messageService: service,
            persistence: persistence,
            offlineQueue: queue,
            networkMonitor: network,
            reactionOutbox: outbox,
            attachments: attachments,
            now: { clock.now }
        )
        return Rig(
            sut: sut, persistence: persistence, service: service, queue: queue,
            network: network, outbox: outbox, attachments: attachments, clock: clock
        )
    }

    // MARK: - Épingle

    func test_togglePin_serviceFailure_restoresPreviousPin_andReturnsUserFacingFailure() async {
        let rig = makeRig()
        rig.service.pinResult = .failure(NSError(domain: "t", code: 1, userInfo: [NSLocalizedDescriptionKey: "refus"]))

        let failure = await rig.sut.togglePin(
            messageId: "m1", serverId: "s1", previous: MessagePinState(pinnedAt: nil, pinnedBy: nil), currentUserId: "u1"
        )

        let calls = await rig.persistence.calls
        XCTAssertEqual(failure?.userMessage, "refus")
        XCTAssertEqual(calls.count, 2)
        guard case .updatePinned(_, let pinnedAt, let pinnedBy) = calls[0] else { return XCTFail("pose d'abord") }
        XCTAssertNotNil(pinnedAt)
        XCTAssertEqual(pinnedBy, "u1")
        XCTAssertEqual(calls[1], .updatePinned(localId: "m1", pinnedAt: nil, pinnedBy: nil))
    }

    func test_togglePin_alreadyPinned_unpinsOptimistically_andRestoresOnFailure() async {
        let rig = makeRig()
        rig.service.unpinResult = .failure(NSError(domain: "t", code: 1))
        let pinnedAt = Date(timeIntervalSince1970: 50)

        let failure = await rig.sut.togglePin(
            messageId: "m1", serverId: "s1", previous: MessagePinState(pinnedAt: pinnedAt, pinnedBy: "u2"), currentUserId: "u1"
        )

        let calls = await rig.persistence.calls
        XCTAssertNotNil(failure)
        XCTAssertEqual(calls, [
            .updatePinned(localId: "m1", pinnedAt: nil, pinnedBy: nil),
            .updatePinned(localId: "m1", pinnedAt: pinnedAt, pinnedBy: "u2"),
        ])
    }

    // MARK: - Suppression

    func test_deleteMessage_offline_marksDeleted_enqueuesDelete_neverCallsService() async {
        let rig = makeRig(isOnline: false)

        let failure = await rig.sut.deleteForEveryone(messageId: "m1", serverId: "s1")

        let calls = await rig.persistence.calls
        let deletes = await rig.queue.enqueuedDeletes
        XCTAssertNil(failure)
        XCTAssertEqual(calls, [.markDeleted(localId: "m1")])
        XCTAssertEqual(deletes.map(\.messageId), ["s1"])
        XCTAssertEqual(deletes.map(\.clientMessageId), ["m1"])
        XCTAssertEqual(rig.service.deleteCallCount, 0)
    }

    func test_deleteMessage_serviceFailure_marksUndeleted_andReturnsFailure() async {
        let rig = makeRig()
        rig.service.deleteResult = .failure(NSError(domain: "t", code: 1, userInfo: [NSLocalizedDescriptionKey: "non"]))

        let failure = await rig.sut.deleteForEveryone(messageId: "m1", serverId: "s1")

        let calls = await rig.persistence.calls
        XCTAssertEqual(failure?.userMessage, "non")
        XCTAssertEqual(calls, [.markDeleted(localId: "m1"), .markUndeleted(localId: "m1")])
    }

    func test_deleteMessage_failedDelivery_cancelsOutboxRow_andNeverMarksDeleted() async {
        let rig = makeRig()

        await rig.sut.withdrawUnsent(messageId: "m1")

        let cancelled = await rig.queue.cancelledPendingSendClientMessageIds
        let cleared = await rig.queue.clearedSendMessageRowClientMessageIds
        let calls = await rig.persistence.calls
        XCTAssertEqual(cancelled, ["m1"])
        XCTAssertEqual(cleared, ["m1"])
        XCTAssertTrue(calls.isEmpty)
    }

    func test_removeForModeration_offline_refusesWithoutTouchingTheStore() async {
        let rig = makeRig(isOnline: false)

        let failure = await rig.sut.removeForModeration(messageId: "m1", serverId: "s1", reason: "spam")

        let calls = await rig.persistence.calls
        XCTAssertNotNil(failure)
        XCTAssertTrue(calls.isEmpty)
    }

    // MARK: - Retrait d'une sélection (#11159)

    private func selection(
        _ id: String, mine: Bool = false, unsent: Bool = false
    ) -> SelectionRemovalTarget {
        SelectionRemovalTarget(messageId: id, serverId: "srv-\(id)", isMine: mine, isUnsent: unsent)
    }

    func test_removeSelection_offline_refusesBeforeDiscardingOrTouchingTheStore() async {
        let rig = makeRig(isOnline: false)
        var discarded: [String] = []

        let failure = await rig.sut.removeSelection(
            [selection("a"), selection("b", mine: true, unsent: true)], reason: "spam"
        ) { discarded.append($0) }

        let calls = await rig.persistence.calls
        XCTAssertNotNil(failure)
        XCTAssertTrue(discarded.isEmpty)
        XCTAssertTrue(calls.isEmpty)
        XCTAssertEqual(rig.service.deleteCallCount, 0)
    }

    func test_removeSelection_mixed_othersCarryTheReason_ownLeaveWithoutOne_unsentAreOnlyDiscarded() async {
        let rig = makeRig()
        var discarded: [String] = []

        let failure = await rig.sut.removeSelection(
            [selection("a"), selection("mine", mine: true), selection("draft", mine: true, unsent: true)],
            reason: "Propos haineux"
        ) { discarded.append($0) }

        let calls = await rig.persistence.calls
        XCTAssertNil(failure)
        XCTAssertEqual(discarded, ["draft"])
        XCTAssertEqual(calls, [.markDeleted(localId: "a"), .markDeleted(localId: "mine")])
        XCTAssertEqual(rig.service.deleteCallCount, 2)
        XCTAssertEqual(rig.service.deleteReasonsByMessageId["srv-a"], .some("Propos haineux"))
        XCTAssertEqual(rig.service.deleteReasonsByMessageId["srv-mine"], .some(nil))
    }

    func test_removeSelection_oneRefusal_restoresOnlyThatMessage_andReportsTheFailure() async {
        let rig = makeRig()
        rig.service.deleteFailingMessageIds = ["srv-b"]

        let failure = await rig.sut.removeSelection([selection("a"), selection("b")], reason: "spam") { _ in }

        let calls = await rig.persistence.calls
        XCTAssertNotNil(failure)
        XCTAssertEqual(calls, [.markDeleted(localId: "a"), .markDeleted(localId: "b"), .markUndeleted(localId: "b")])
    }

    // MARK: - Édition

    func test_editMessage_serviceFailure_restoresOriginal_andDropsEditHistory() async {
        let rig = makeRig()
        rig.service.editResult = .failure(NSError(domain: "t", code: 1, userInfo: [NSLocalizedDescriptionKey: "échec"]))
        let serverId = "edit-failure-srv-1"
        var hookCalls = 0

        let failure = await rig.sut.editMessage(
            messageId: "m1", serverId: serverId, content: "  nouveau  ", originalContent: "ancien",
            beforeOptimisticWrite: { hookCalls += 1 }
        )

        let calls = await rig.persistence.calls
        XCTAssertEqual(failure?.userMessage, "échec")
        XCTAssertEqual(hookCalls, 1)
        XCTAssertEqual(calls.first, .markEditedLocally(localId: "m1", newContent: "nouveau"))
        XCTAssertEqual(calls.last, .markEdited(localId: "m1", newContent: "ancien", editedAt: Date(timeIntervalSince1970: 1_000)))
        XCTAssertTrue(EditHistoryStore.shared.revisions(for: serverId).isEmpty)
    }

    func test_editMessage_blankContent_isNoOp() async {
        let rig = makeRig()

        let failure = await rig.sut.editMessage(
            messageId: "m1", serverId: "s1", content: "   ", originalContent: "ancien", beforeOptimisticWrite: {}
        )

        let calls = await rig.persistence.calls
        XCTAssertNil(failure)
        XCTAssertTrue(calls.isEmpty)
        XCTAssertEqual(rig.service.editCallCount, 0)
    }

    func test_editMessage_offline_enqueuesEdit_andKeepsTheOptimisticContent() async {
        let rig = makeRig(isOnline: false)

        let failure = await rig.sut.editMessage(
            messageId: "m1", serverId: "s1", content: "nouveau", originalContent: "ancien", beforeOptimisticWrite: {}
        )

        let edits = await rig.queue.enqueuedEdits
        let calls = await rig.persistence.calls
        XCTAssertNil(failure)
        XCTAssertEqual(edits.map(\.content), ["nouveau"])
        XCTAssertEqual(calls, [.markEditedLocally(localId: "m1", newContent: "nouveau")])
    }

    // MARK: - Réactions

    func test_reactionTokenBucket_allowsBurstOfTen_thenRefuses_thenRefillsAtThreePerSecond() {
        let rig = makeRig()

        let burst = (0..<10).map { _ in rig.sut.consumeReactionToken() }
        let eleventh = rig.sut.consumeReactionToken()
        rig.clock.now = rig.clock.now.addingTimeInterval(1)
        let afterOneSecond = (0..<4).map { _ in rig.sut.consumeReactionToken() }

        XCTAssertTrue(burst.allSatisfy { $0 })
        XCTAssertFalse(eleventh)
        XCTAssertEqual(afterOneSecond, [true, true, true, false])
    }

    func test_addReaction_writesThroughPersistence_andQueuesAnAddOnTheServerId() async {
        let rig = makeRig()

        rig.sut.addReaction(localId: "m1", remoteId: "s1", participantId: "u1", emoji: "🔥")
        var calls = await rig.persistence.calls
        for _ in 0..<500 where calls.isEmpty || rig.outbox.enqueued.isEmpty {
            await Task.yield()
            calls = await rig.persistence.calls
        }

        XCTAssertEqual(rig.outbox.enqueued, [
            MockReactionOutbox.Enqueued(messageId: "s1", emoji: "🔥", action: .add, conversationId: conversationId)
        ])
        XCTAssertEqual(calls, [.appendReaction(localId: "m1", emoji: "🔥", participantId: "u1")])
    }

    func test_removeReaction_writesThroughPersistence_andQueuesARemove() async {
        let rig = makeRig()

        rig.sut.removeReaction(localId: "m1", remoteId: "s1", participantId: "u1", emoji: "🔥")
        var calls = await rig.persistence.calls
        for _ in 0..<500 where calls.isEmpty || rig.outbox.enqueued.isEmpty {
            await Task.yield()
            calls = await rig.persistence.calls
        }

        XCTAssertEqual(rig.outbox.enqueued.map(\.action), [.remove])
        XCTAssertEqual(calls, [.removeReaction(localId: "m1", emoji: "🔥", participantId: "u1")])
    }

    // MARK: - Compensations de l'outbox

    private func makeExhausted(
        kind: OutboxKind, reaction: OfflineRetrySuccess.ReactionContext? = nil, id: String = "m1"
    ) -> OfflineRetryExhausted {
        OfflineRetryExhausted(kind: kind, clientMessageId: id, conversationId: conversationId, reaction: reaction)
    }

    func test_compensate_retryExhaustedReactionAdd_removesOptimisticReaction() async {
        let rig = makeRig()
        let payload = makeExhausted(kind: .sendReaction, reaction: .init(messageId: "m1", emoji: "👍", action: .add))

        await rig.sut.compensate(payload, currentUserId: "u1", serverId: { $0 })

        let calls = await rig.persistence.calls
        XCTAssertEqual(calls, [.removeReaction(localId: "m1", emoji: "👍", participantId: "u1")])
    }

    func test_compensate_retryExhaustedReactionRemove_reappendsTheReaction() async {
        let rig = makeRig()
        let payload = makeExhausted(kind: .sendReaction, reaction: .init(messageId: "m1", emoji: "👍", action: .remove))

        await rig.sut.compensate(payload, currentUserId: "u1", serverId: { _ in "srv" })

        let calls = await rig.persistence.calls
        XCTAssertEqual(calls, [.appendReaction(localId: "m1", emoji: "👍", participantId: "u1")])
    }

    func test_compensate_retryExhaustedEdit_restoresLastRevision() async {
        let rig = makeRig()
        let serverId = "compensate-edit-srv-1"
        EditHistoryStore.shared.recordRevision(messageId: serverId, previousContent: "avant")

        await rig.sut.compensate(makeExhausted(kind: .editMessage), currentUserId: "u1", serverId: { _ in serverId })

        let calls = await rig.persistence.calls
        XCTAssertEqual(calls, [.markEditedLocally(localId: "m1", newContent: "avant")])
        XCTAssertTrue(EditHistoryStore.shared.revisions(for: serverId).isEmpty)
    }

    func test_compensate_retryExhaustedDelete_marksUndeleted() async {
        let rig = makeRig()

        await rig.sut.compensate(makeExhausted(kind: .deleteMessage), currentUserId: "u1", serverId: { $0 })

        let calls = await rig.persistence.calls
        XCTAssertEqual(calls, [.markUndeleted(localId: "m1")])
    }

    func test_compensate_otherKinds_doNothing() async {
        let rig = makeRig()

        await rig.sut.compensate(makeExhausted(kind: .blockUser), currentUserId: "u1", serverId: { $0 })

        let calls = await rig.persistence.calls
        XCTAssertTrue(calls.isEmpty)
    }

    // MARK: - Pièces jointes

    func test_removeAttachment_serviceFailure_restoresOriginalAttachmentsJson() async throws {
        let rig = makeRig()
        rig.attachments.failure = NSError(domain: "t", code: 1, userInfo: [NSLocalizedDescriptionKey: "nope"])
        let keep = MeeshyMessageAttachment(id: "a1")
        let drop = MeeshyMessageAttachment(id: "a2")

        let failure = await rig.sut.removeAttachment(messageId: "m1", attachmentId: "a2", original: [keep, drop])

        let calls = await rig.persistence.calls
        let storedJson = await rig.persistence.lastAttachmentsJson
        let restored = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: try XCTUnwrap(storedJson))
        XCTAssertEqual(failure?.userMessage, "nope")
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(restored.map(\.id), ["a1", "a2"])
    }

    func test_removeAttachment_success_writesTheRemainingAttachmentsOnly() async throws {
        let rig = makeRig()

        let failure = await rig.sut.removeAttachment(
            messageId: "m1", attachmentId: "a2", original: [MeeshyMessageAttachment(id: "a1"), MeeshyMessageAttachment(id: "a2")]
        )

        let storedJson = await rig.persistence.lastAttachmentsJson
        let remaining = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: try XCTUnwrap(storedJson))
        XCTAssertNil(failure)
        XCTAssertEqual(remaining.map(\.id), ["a1"])
        XCTAssertEqual(rig.attachments.deleted, ["a2"])
    }

    // MARK: - Texte d'erreur

    func test_userFacingMessage_serverError_isGeneric_otherErrors_keepDescription() {
        let generic = ConversationErrorText.message(for: MeeshyError.server(statusCode: 500, message: "debug interne"))
        let kept = ConversationErrorText.message(for: NSError(domain: "t", code: 1, userInfo: [NSLocalizedDescriptionKey: "lisible"]))

        XCTAssertNotEqual(generic, "debug interne")
        XCTAssertEqual(kept, "lisible")
    }
}
