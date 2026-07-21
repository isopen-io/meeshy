import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// Covers Bug 1 (lost second offline send) fix in
/// `ConversationViewModel.sendMessage`, plus the 2026-06-09 concurrent-sends
/// change. The legacy code fire-and-forgot the outbox enqueue, AND a global
/// `isSending` mutex serialized ALL sends — silently dropping the second while
/// the first was still in-flight (the "can't send several in a row while the
/// clock shows" bug). The path now AWAITS the enqueue and lets DISTINCT
/// messages fly concurrently, deduping only an accidental double-tap of the
/// SAME message. Tests exercise both invariants.
///
/// All state lives inside `makeFixture(...)` factory — no shared mutable
/// `setUp`/`tearDown` properties (CLAUDE.md: "factory functions for test
/// data, no `let`/`beforeEach` mutation"). Each test owns its mocks, pool,
/// and SUT, so test order independence is structural.
@MainActor
final class ConversationViewModelOfflineQueueTests: XCTestCase {

    // MARK: - Fixture

    /// Bundle of co-owned test collaborators returned by `makeFixture`. The
    /// SUT and its mocks have intertwined lifetimes — separating them into
    /// loose tuples would make the test bodies noisy. Owned by the test
    /// stack frame, released on test exit.
    private struct Fixture {
        let sut: ConversationViewModel
        let messageService: MockMessageService
        let messageSocket: MockMessageSocket
        let offlineQueue: FakeOfflineMessageQueue
        let networkMonitor: FakeNetworkMonitor
        let persistencePool: DatabaseQueue
        let conversationId: String
        let userId: String

        /// Local equivalent of the previous instance-level `fetchRecord`
        /// helper. Lives on the fixture so each test can read GRDB rows
        /// from its own isolated pool without leaking the closure to a
        /// shared property.
        func fetchRecord(localId: String) async throws -> MessageRecord? {
            try await persistencePool.read { db in
                try MessageRecord.fetchOne(db, key: localId)
            }
        }
    }

    private func makeFixture(
        isOnline: Bool = false,
        offlineQueueDelay: Duration = .zero,
        offlineQueueThrows: Bool = false,
        restSendFailure: Error? = nil,
        userSystemLanguage: String? = nil
    ) async throws -> Fixture {
        let conversationId = "00000000000000000000ff01"
        let userId = "00000000000000000000ff99"
        // Invalidate any cached snapshot left by previous test runs that
        // reuse the same conversation id. Cheap and local — the cache is
        // a singleton so per-test invalidation is the safe boundary.
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)

        let auth = MockAuthManager()
        let messageService = MockMessageService()
        if let restSendFailure {
            messageService.sendResult = .failure(restSendFailure)
        }
        let conversationService = MockConversationService()
        let reactionService = MockReactionService()
        let reportService = MockReportService()
        let messageSocket = MockMessageSocket()
        let offlineQueue = FakeOfflineMessageQueue()
        if offlineQueueDelay != .zero {
            await offlineQueue.setDelay(offlineQueueDelay)
        }
        if offlineQueueThrows {
            await offlineQueue.setShouldThrow(true)
        }
        let networkMonitor = FakeNetworkMonitor(isOnline: isOnline)
        let pool = try Self.makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        // ConversationViewModel checks `MessageSocketManager.shared.isConnected`
        // on the online send path. Pinning to false avoids leaking state from
        // sibling test suites — the offline branch returns before the
        // singleton is consulted but we keep it deterministic.
        MessageSocketManager.shared.isConnected = false

        let user = MeeshyUser(
            id: userId, username: "fixture", displayName: "Fixture User",
            systemLanguage: userSystemLanguage
        )
        auth.simulateLoggedIn(user: user)
        let deps = ConversationDependencies(dbPool: pool, persistence: persistence)
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: conversationService,
            reactionService: reactionService,
            reportService: reportService,
            messageSocket: messageSocket,
            dependencies: deps,
            networkMonitor: networkMonitor,
            offlineQueue: offlineQueue
        )
        sut.start()
        return Fixture(
            sut: sut,
            messageService: messageService,
            messageSocket: messageSocket,
            offlineQueue: offlineQueue,
            networkMonitor: networkMonitor,
            persistencePool: pool,
            conversationId: conversationId,
            userId: userId
        )
    }

    private static func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    // MARK: - Tests

    /// Sanity baseline: a single offline send enqueues exactly one item AND
    /// inserts one optimistic bubble in GRDB.
    func test_single_offline_send_enqueues_one_item_and_inserts_one_bubble() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(content: "Hello world")

        XCTAssertTrue(ok)
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 1)
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertEqual(contents, ["Hello world"])

        let cmid = await fx.offlineQueue.enqueuedClientMessageIds.first
        let cmidUnwrapped = try XCTUnwrap(cmid)
        let record = try await fx.fetchRecord(localId: cmidUnwrapped)
        XCTAssertNotNil(record, "Optimistic record must be persisted before enqueue returns")
        XCTAssertEqual(record?.state, .sending)
        XCTAssertEqual(record?.content, "Hello world")
    }

    /// Prisme Linguistique — the offline optimistic `MessageRecord` must
    /// carry the CALLER's detected `originalLanguage`, not a hardcoded "fr".
    /// A non-French offline send that later replays through the outbox would
    /// otherwise be translated for every recipient as if it were French.
    func test_offline_send_persistsCallerOriginalLanguage_notHardcodedFr() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(content: "Hello world", originalLanguage: "es")

        XCTAssertTrue(ok)
        let cmid = try XCTUnwrap(await fx.offlineQueue.enqueuedClientMessageIds.first)
        let record = try await fx.fetchRecord(localId: cmid)
        XCTAssertEqual(record?.originalLanguage, "es",
            "the optimistic offline record must use the caller's originalLanguage, not a hardcoded 'fr'")
    }

    /// Prisme Linguistique — when the CALLER supplies no `originalLanguage`
    /// at all (unlike every other test in this file, which always passes a
    /// non-nil value and therefore can never exercise this fallback), the
    /// send-time default must consult the user's own configured
    /// `systemLanguage` (Prisme resolution order: systemLanguage → … →
    /// "fr") — NOT skip straight to a bare hardcoded "fr" that ignores a
    /// non-French user's own preference entirely.
    func test_offline_send_withNoOriginalLanguage_fallsBackToUserSystemLanguage_notHardcodedFr() async throws {
        let fx = try await makeFixture(userSystemLanguage: "es")

        let ok = await fx.sut.sendMessage(content: "Hola", originalLanguage: nil)

        XCTAssertTrue(ok)
        let cmid = try XCTUnwrap(await fx.offlineQueue.enqueuedClientMessageIds.first)
        let record = try await fx.fetchRecord(localId: cmid)
        XCTAssertEqual(record?.originalLanguage, "es",
            "with no caller-supplied language, the fallback must consult the user's configured systemLanguage, not hardcode 'fr'")
    }

    /// The core Bug 1 regression: two awaited offline sends back-to-back
    /// MUST both reach the queue. The legacy fire-and-forget path lost the
    /// second message because the optimistic insert raced its outbox write.
    func test_two_offline_sends_back_to_back_enqueue_two_items() async throws {
        let fx = try await makeFixture()

        let firstOk = await fx.sut.sendMessage(content: "First")
        let secondOk = await fx.sut.sendMessage(content: "Second")

        XCTAssertTrue(firstOk)
        XCTAssertTrue(secondOk)
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 2, "Both offline sends must reach the outbox")
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertEqual(contents, ["First", "Second"])
    }

    /// Concurrent sends of DISTINCT messages must BOTH proceed — a real
    /// messenger lets several messages fly at once, each with its own optimistic
    /// bubble + clock. Replaces the legacy `isSending` mutex which serialized
    /// ALL sends and silently dropped the second while the first was in-flight
    /// (the "can't send several in a row while the clock shows" bug, 2026-06-09).
    func test_concurrent_distinct_sends_both_proceed() async throws {
        let fx = try await makeFixture(offlineQueueDelay: .milliseconds(150))

        async let a = fx.sut.sendMessage(content: "Tap A")
        async let b = fx.sut.sendMessage(content: "Tap B")
        let results = await [a, b]

        let succeeded = results.filter { $0 }.count
        XCTAssertEqual(succeeded, 2, "Two DISTINCT concurrent sends must both succeed")
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 2, "Both distinct messages must reach the outbox")
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertEqual(Set(contents), ["Tap A", "Tap B"])
    }

    /// Double-tap protection survives the mutex removal: the SAME logical
    /// message fired twice within the debounce window dedups to a single send
    /// (no duplicate optimistic row, no duplicate outbox item). The check-and-set
    /// runs before the first `await`, so the @MainActor serialization of the
    /// synchronous prefix makes it atomic against the concurrent burst.
    func test_duplicate_rapid_tap_is_deduped() async throws {
        let fx = try await makeFixture(offlineQueueDelay: .milliseconds(150))

        async let a = fx.sut.sendMessage(content: "Same text")
        async let b = fx.sut.sendMessage(content: "Same text")
        let results = await [a, b]

        let succeeded = results.filter { $0 }.count
        let rejected = results.filter { !$0 }.count
        XCTAssertEqual(succeeded, 1, "A rapid double-tap of identical content sends once")
        XCTAssertEqual(rejected, 1, "The duplicate tap is deduped")
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 1)
    }

    /// Three DISTINCT sends — concurrent burst then a sequential one — all reach
    /// the queue. No coarse lock collapses them into a single survivor.
    func test_three_distinct_sends_all_enqueue() async throws {
        let fx = try await makeFixture(offlineQueueDelay: .milliseconds(80))

        async let a = fx.sut.sendMessage(content: "Tap A")
        async let b = fx.sut.sendMessage(content: "Tap B")
        _ = await [a, b]
        let later = await fx.sut.sendMessage(content: "Tap C")

        XCTAssertTrue(later)
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 3, "Three distinct messages → three outbox items")
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertEqual(Set(contents), ["Tap A", "Tap B", "Tap C"])
    }

    /// When the outbox write throws, the optimistic row must be flipped to
    /// `.failed` so the UI can surface a retry affordance instead of leaving
    /// the bubble stuck on the spinner.
    func test_enqueue_throws_marks_bubble_failed() async throws {
        let fx = try await makeFixture(offlineQueueThrows: true)

        let ok = await fx.sut.sendMessage(content: "Doomed")

        XCTAssertFalse(ok)
        let convId = fx.conversationId
        let allFailed = try await fx.persistencePool.read { db in
            try MessageRecord
                .filter(Column("conversationId") == convId)
                .filter(Column("state") == MessageState.failed.rawValue)
                .fetchAll(db)
        }
        XCTAssertEqual(allFailed.count, 1)
        XCTAssertEqual(allFailed.first?.content, "Doomed")
        XCTAssertNotNil(allFailed.first?.lastError)
    }

    /// `attachmentIds` round-trips through the offline queue payload — the
    /// outbox must preserve them so the dispatcher can replay the REST POST
    /// with the same `attachmentIds` on reconnect.
    func test_attachment_ids_are_preserved_through_offline_enqueue() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(
            content: "Photo caption",
            attachmentIds: ["att-1", "att-2", "att-3"]
        )

        XCTAssertTrue(ok)
        let attachmentIds = await fx.offlineQueue.enqueuedAttachmentIds
        XCTAssertEqual(attachmentIds, [["att-1", "att-2", "att-3"]])
    }

    /// `replyToId` must survive the offline queue so the dispatcher rebuilds
    /// the reply reference server-side on replay.
    func test_reply_to_id_is_preserved_through_offline_enqueue() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(
            content: "Replying",
            replyToId: "parent-message-id"
        )

        XCTAssertTrue(ok)
        let replyToIds = await fx.offlineQueue.enqueuedReplyToIds
        XCTAssertEqual(replyToIds, ["parent-message-id"])
    }

    /// Forwarded metadata (`forwardedFromId` + `forwardedFromConversationId`)
    /// must survive the offline queue so the dispatcher reconstructs the
    /// forward chain server-side on replay.
    func test_forwarded_metadata_is_preserved_through_offline_enqueue() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(
            content: "Forwarded",
            forwardedFromId: "orig-msg-id",
            forwardedFromConversationId: "orig-conv-id"
        )

        XCTAssertTrue(ok)
        let forwardedFromIds = await fx.offlineQueue.enqueuedForwardedFromIds
        let forwardedFromConvIds = await fx.offlineQueue.enqueuedForwardedFromConversationIds
        XCTAssertEqual(forwardedFromIds, ["orig-msg-id"])
        XCTAssertEqual(forwardedFromConvIds, ["orig-conv-id"])
    }

    /// Bug 1 — online retry path (B2). When the REST send fails AND the
    /// socket fallback returns no ACK, the catch block enqueues a retry
    /// item in the offline queue for the unified outbox to flush. The
    /// legacy `Task { try? await OfflineQueue.shared.enqueue(...) }` was
    /// fire-and-forget — the function returned before GRDB committed the
    /// retry row, so a process kill or fast second tap could silently
    /// drop the auto-retry. This test exercises the awaited path: with
    /// network online + REST stubbed to throw + socket fallback returning
    /// nil, exactly one item must reach the injected `offlineQueue` via
    /// the now-awaited enqueue call.
    func test_online_send_failure_falls_back_to_awaited_retry_enqueue() async throws {
        let fx = try await makeFixture(
            isOnline: true,
            restSendFailure: NSError(
                domain: "ConversationViewModelOfflineQueueTests",
                code: 500,
                userInfo: [NSLocalizedDescriptionKey: "synthetic REST failure"]
            )
        )
        // Default MockMessageSocket.sendViaSocketFallbackResult is nil → the
        // catch block skips the socket-recovery early-return and falls
        // through to the retry-enqueue path under test.
        let ok = await fx.sut.sendMessage(content: "online-then-retry")

        XCTAssertFalse(ok, "Online send with REST failure + no socket ack returns false")
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 1, "Retry path must AWAIT the enqueue, not fire-and-forget")
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertEqual(contents, ["online-then-retry"])
    }

    /// Prisme Linguistique — the auto-retry outbox item built in the
    /// online-failure catch block must carry the CALLER's `originalLanguage`,
    /// not a hardcoded "fr". Otherwise a non-French message that fails once
    /// online gets replayed (and displayed to every recipient) as French.
    func test_onlineSendFailure_retryEnqueue_preservesCallerOriginalLanguage_notHardcodedFr() async throws {
        let fx = try await makeFixture(
            isOnline: true,
            restSendFailure: NSError(
                domain: "ConversationViewModelOfflineQueueTests",
                code: 500,
                userInfo: [NSLocalizedDescriptionKey: "synthetic REST failure"]
            )
        )

        let ok = await fx.sut.sendMessage(content: "hola", originalLanguage: "es")

        XCTAssertFalse(ok)
        let item = try XCTUnwrap(await fx.offlineQueue.enqueuedItems.first)
        XCTAssertEqual(item.originalLanguage, "es",
            "the retry outbox item must use the caller's originalLanguage, not a hardcoded 'fr'")
    }

    // MARK: - T11 — offline edit / delete route through the outbox

    /// Editing a message while offline must enqueue a durable `.editMessage`
    /// outbox row (flushed on reconnect via T10), NOT hit the REST edit
    /// directly and lose the change on failure.
    func test_editMessage_offline_enqueuesEditThroughOutbox() async throws {
        let fx = try await makeFixture(isOnline: false)

        await fx.sut.editMessage(messageId: "m_edit", newContent: "edited text")

        let edits = await fx.offlineQueue.enqueuedEdits
        XCTAssertEqual(edits.count, 1, "offline edit must be queued in the outbox, not lost")
        XCTAssertEqual(edits.first?.content, "edited text")
        XCTAssertEqual(edits.first?.clientMessageId, "m_edit",
            "coalescing key = the message's local id (its cid while a send is still pending)")
        XCTAssertEqual(edits.first?.conversationId, fx.conversationId)
        XCTAssertEqual(fx.messageService.editCallCount, 0,
            "the offline path must NOT call the REST edit directly")
    }

    /// Deleting a message (for everyone) while offline must enqueue a durable
    /// `.deleteMessage` outbox row, NOT hit the REST delete directly.
    func test_deleteMessage_offline_enqueuesDeleteThroughOutbox() async throws {
        let fx = try await makeFixture(isOnline: false)

        await fx.sut.deleteMessage(messageId: "m_del", mode: .everyone)

        let deletes = await fx.offlineQueue.enqueuedDeletes
        XCTAssertEqual(deletes.count, 1, "offline delete must be queued in the outbox, not lost")
        XCTAssertEqual(deletes.first?.clientMessageId, "m_del")
        XCTAssertEqual(deletes.first?.conversationId, fx.conversationId)
        XCTAssertEqual(fx.messageService.deleteCallCount, 0,
            "the offline path must NOT call the REST delete directly")
    }

    /// Deleting a `.failed` message must cancel any pending outbox resend
    /// BEFORE the local-only purge. `retryMessage`'s media-retry path resets
    /// the message's outbox row back to `.pending` while it (re)uploads — if
    /// the user deletes during that window, a purely local purge with no
    /// cancellation would let the reset row dispatch and reach the
    /// server/other participants after the sender believes the message is
    /// gone. Must also never touch REST (the `.failed` message has no real
    /// serverId).
    func test_deleteMessage_failedMessage_cancelsPendingOutboxSendBeforeLocalPurge() async throws {
        let fx = try await makeFixture()
        try await seedFailedMediaMessage(localId: "m_del_failed", fixture: fx)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "m_del_failed", in: fx.sut
        ) { $0.deliveryStatus == .failed }
        XCTAssertTrue(seeded, "precondition: the failed message must be visible")

        await fx.sut.deleteMessage(messageId: "m_del_failed", mode: .everyone)

        let cancelled = await fx.offlineQueue.cancelledPendingSendClientMessageIds
        XCTAssertEqual(cancelled, ["m_del_failed"],
            "must cancel any pending outbox resend before purging locally, or a prior retry's reset row can still reach the server")
        XCTAssertEqual(fx.messageService.deleteCallCount, 0,
            "a .failed message never reached the server — must never hit REST delete")
    }

    // MARK: - S3 — rollback exhausted offline edit/delete

    /// An offline delete that exhausts its retry budget never reached the
    /// server, so the message must be un-deleted locally — otherwise it shows
    /// as deleted on this device only, forever.
    func test_handleRetryExhausted_deleteMessage_undeletesLocally() async throws {
        let fx = try await makeFixture(isOnline: false)
        try await seedMessage(localId: "m_del_s3", content: "hello", fixture: fx)
        try await fx.sut.messagePersistence.markDeleted(localId: "m_del_s3", deletedAt: Date())

        let before = try await fx.persistencePool.read { db in
            try MessageRecord.filter(Column("localId") == "m_del_s3").fetchOne(db)?.deletedAt
        }
        XCTAssertNotNil(before, "precondition: the message is optimistically deleted")

        await fx.sut.handleRetryExhausted(OfflineRetryExhausted(
            kind: .deleteMessage, clientMessageId: "m_del_s3",
            conversationId: fx.conversationId, lastError: "permanent"))

        let after = try await fx.persistencePool.read { db in
            try MessageRecord.filter(Column("localId") == "m_del_s3").fetchOne(db)?.deletedAt
        }
        XCTAssertNil(after,
            "an exhausted offline delete must roll back (un-delete) instead of diverging forever")
    }

    /// An offline edit that exhausts must restore the pre-edit content (kept in
    /// EditHistoryStore) and drop the phantom revision.
    func test_handleRetryExhausted_editMessage_restoresOriginalContent() async throws {
        let fx = try await makeFixture(isOnline: false)
        try await seedMessage(localId: "m_edit_s3", content: "original", fixture: fx)
        // Mirror editMessage: record the pre-edit revision, then apply the edit.
        EditHistoryStore.shared.recordRevision(messageId: "m_edit_s3", previousContent: "original")
        try await fx.sut.messagePersistence.markEdited(
            localId: "m_edit_s3", newContent: "edited offline", editedAt: Date())

        let before = try await fx.persistencePool.read { db in
            try MessageRecord.filter(Column("localId") == "m_edit_s3").fetchOne(db)?.content
        }
        XCTAssertEqual(before, "edited offline", "precondition: the optimistic edit is applied")

        await fx.sut.handleRetryExhausted(OfflineRetryExhausted(
            kind: .editMessage, clientMessageId: "m_edit_s3",
            conversationId: fx.conversationId, lastError: "permanent"))

        let after = try await fx.persistencePool.read { db in
            try MessageRecord.filter(Column("localId") == "m_edit_s3").fetchOne(db)?.content
        }
        XCTAssertEqual(after, "original",
            "an exhausted offline edit must restore the pre-edit content")
        XCTAssertTrue(EditHistoryStore.shared.revisions(for: "m_edit_s3").isEmpty,
            "the phantom edit revision must be removed on rollback")
    }

    // MARK: - retryMessage (manual retry after outbox exhaustion)

    /// A `.failed` message that carries attachments must NOT be resent via
    /// the naive `sendMessage(content:replyToId:)` path: the displayed
    /// `Message.attachments` only ever hold the PRE-upload local placeholder
    /// ids (never reconciled after the fact), so a captioned media message
    /// would resend as text-only and an uncaptioned one would be rejected
    /// outright by `sendMessage`'s empty-content guard, stranding the bubble
    /// mid-clock. It must instead reset + redrive the durable outbox row,
    /// which still holds the real uploaded attachment ids.
    func test_retryMessage_failedMessageWithAttachments_resetsOutboxRowInsteadOfResendingTextOnly() async throws {
        let fx = try await makeFixture()
        try await seedFailedMediaMessage(localId: "m_retry_media", fixture: fx)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "m_retry_media", in: fx.sut
        ) { $0.deliveryStatus == .failed && !$0.attachments.isEmpty }
        XCTAssertTrue(seeded, "precondition: the failed media message must be visible with its attachment")

        await fx.sut.retryMessage(messageId: "m_retry_media")

        let retried = await fx.offlineQueue.retriedClientMessageIds
        XCTAssertEqual(retried, ["m_retry_media"],
            "must reset the existing outbox row (preserves the real attachment ids) instead of re-sending")
        XCTAssertEqual(fx.messageService.sendCallCount, 0,
            "must NOT resend through the REST send path, which would drop the attachments")
    }

    /// The media-retry path resets the OUTBOX row but must also flip the
    /// local `MessageRecord` state, or the bubble stays stuck displaying
    /// `.failed` (with its retry affordance still live, see
    /// `BubbleFailedRetryBar`) for the entire upload + dispatch duration —
    /// even though a resend is genuinely in flight. `.failed → .queued`
    /// (via the same `.retry` event as the text-only path 2 lines below)
    /// maps to `.slow` in `MessageRecord.toMessage`, not `.failed`.
    func test_retryMessage_failedMessageWithAttachments_transitionsLocalStateOutOfFailed() async throws {
        let fx = try await makeFixture()
        try await seedFailedMediaMessage(localId: "m_retry_media_state", fixture: fx)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "m_retry_media_state", in: fx.sut
        ) { $0.deliveryStatus == .failed && !$0.attachments.isEmpty }
        XCTAssertTrue(seeded, "precondition: the failed media message must be visible with its attachment")

        await fx.sut.retryMessage(messageId: "m_retry_media_state")

        let leftFailedState = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "m_retry_media_state", in: fx.sut
        ) { $0.deliveryStatus != .failed }
        XCTAssertTrue(leftFailedState,
            "resetting the outbox row must also flip the local record out of .failed, or the retry band never clears")
    }

    /// A `.failed` text-only message (no attachments) keeps the existing
    /// resend-in-place behaviour — `content` + `replyToId` are all
    /// `sendMessage` needs to recreate it faithfully, so no outbox reset
    /// is required (or desired: it would bypass the socket-first fast path).
    func test_retryMessage_failedTextOnlyMessage_stillResendsInPlace() async throws {
        // Online so the resend actually completes through REST instead of
        // re-entering the offline branch (which would attempt a second
        // optimistic insert on the same already-existing localId).
        let fx = try await makeFixture(isOnline: true)
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "m_retry_text", conversationId: fx.conversationId,
            senderId: fx.userId, content: "hello", state: .failed
        )
        try await fx.sut.messagePersistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "m_retry_text", in: fx.sut
        ) { $0.deliveryStatus == .failed }
        XCTAssertTrue(seeded, "precondition: the failed text message must be visible")

        await fx.sut.retryMessage(messageId: "m_retry_text")

        let retried = await fx.offlineQueue.retriedClientMessageIds
        XCTAssertTrue(retried.isEmpty, "a text-only retry must NOT touch the outbox-reset path")
    }

    /// Prisme Linguistique — resending a `.failed` message in place must
    /// preserve its ALREADY-KNOWN `originalLanguage`. Omitting it would let
    /// the retry fall through `sendMessage`'s `originalLanguage ??
    /// Self.composeLanguage(for:preferred:)` fallback (re-detected from the
    /// resent content) and silently rewrite a non-French message's language
    /// identity on every manual retry.
    func test_retryMessage_failedTextOnlyMessage_preservesOriginalLanguage_notHardcodedFr() async throws {
        // Online so the resend actually completes through REST (captured by
        // MockMessageService) instead of re-entering the offline branch.
        let fx = try await makeFixture(isOnline: true)
        try await seedFailedTextMessage(
            localId: "m_retry_text_lang", content: "hola", originalLanguage: "es", fixture: fx
        )
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "m_retry_text_lang", in: fx.sut
        ) { $0.deliveryStatus == .failed }
        XCTAssertTrue(seeded, "precondition: the failed text message must be visible")

        await fx.sut.retryMessage(messageId: "m_retry_text_lang")

        XCTAssertEqual(fx.messageService.lastSendRequest?.originalLanguage, "es",
            "retrying must resend with the message's ORIGINAL language, not fall back to a hardcoded 'fr'")
    }

    private func seedFailedTextMessage(
        localId: String, content: String, originalLanguage: String, fixture fx: Fixture
    ) async throws {
        let record = MessageRecord(
            localId: localId, serverId: nil,
            conversationId: fx.conversationId, senderId: fx.userId,
            content: content, originalLanguage: originalLanguage,
            messageType: "text", messageSource: "user", contentType: "text",
            state: .failed, retryCount: 3, lastError: "synthetic exhausted",
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try await fx.sut.messagePersistence.insertOptimistic(record)
    }

    private func seedFailedMediaMessage(localId: String, fixture fx: Fixture) async throws {
        let attachmentsJson = try JSONEncoder().encode([MeeshyMessageAttachment.image()])
        let record = MessageRecord(
            localId: localId, serverId: nil,
            conversationId: fx.conversationId, senderId: fx.userId,
            content: nil, originalLanguage: "en",
            messageType: "image", messageSource: "user", contentType: "image",
            state: .failed, retryCount: 3, lastError: "synthetic exhausted",
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: attachmentsJson, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try await fx.sut.messagePersistence.insertOptimistic(record)
    }

    private func seedMessage(localId: String, content: String, fixture fx: Fixture) async throws {
        let record = MessageRecord(
            localId: localId, serverId: nil,
            conversationId: fx.conversationId, senderId: fx.userId,
            content: content, originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try await fx.sut.messagePersistence.insertOptimistic(record)
    }
}

// MARK: - Test helpers on FakeOfflineMessageQueue

private extension FakeOfflineMessageQueue {
    func setDelay(_ duration: Duration) {
        delay = duration
    }

    func setShouldThrow(_ value: Bool) {
        shouldThrow = value
    }
}
