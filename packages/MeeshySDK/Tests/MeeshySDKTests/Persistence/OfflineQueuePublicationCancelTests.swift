import XCTest
import GRDB
@testable import MeeshySDK

/// #10321 — « Supprimer » sur une publication encore dans la file.
///
/// Les quatre témoins de l'issue portent sur la table réelle et le flusher
/// réel : (a) une ligne en attente retirée ne part jamais ; (b) une ligne en vol
/// s'arrête — la `Task` d'envoi est annulée et la ligne disparaît sans
/// `.applied` ; (c) si le `POST` avait abouti, aucune ligne ne reste coincée et
/// le serveur fait foi ; (d) côté story, la clé ne change pas au rejeu
/// (`ClientMutationIdDerivedTests`).
final class OfflineQueuePublicationCancelTests: XCTestCase {

    private var pool: DatabaseQueue!

    override func setUp() async throws {
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await OfflineQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        await OfflineQueue.shared.clearAll()
        pool = nil
    }

    // MARK: - Helpers

    private func enqueuePublication() async throws -> String {
        let cmid = ClientMutationId.generate()
        try await OfflineQueue.shared.enqueue(
            .createPost,
            payload: CreatePostPayload(clientMutationId: cmid, content: "En attente", attachmentIds: [], visibility: "PUBLIC"),
            conversationId: nil
        )
        return cmid
    }

    private func row(_ cmid: String) throws -> OutboxRecord? {
        try pool.read { db in try OutboxRecord.fetchOne(db, key: "ofqm_\(cmid)") }
    }

    private func makeFlusher(_ dispatcher: any OutboxDispatching, outcomes: OutcomeLog) -> OutboxFlusher {
        OutboxFlusher(pool: pool, dispatcher: dispatcher, onOutcome: { outcome in outcomes.append(outcome) })
    }

    // MARK: - (a) en attente

    func test_cancelPendingPublication_onPendingRow_removesItAndNothingIsDispatched() async throws {
        let cmid = try await enqueuePublication()

        let verdict = await OfflineQueue.shared.cancelPendingPublication(clientMutationId: cmid)
        let dispatcher = MockOutboxDispatcher()
        await makeFlusher(dispatcher, outcomes: OutcomeLog()).flush()

        XCTAssertEqual(verdict, .removed)
        XCTAssertNil(try row(cmid))
        let processed = await dispatcher.processedIds
        XCTAssertTrue(processed.isEmpty, "une publication retirée ne part pas au retour du réseau")
    }

    // MARK: - (b) en vol

    func test_cancelPendingPublication_whileInflight_cancelsTheDispatchAndDeletesWithoutApplied() async throws {
        let cmid = try await enqueuePublication()
        let dispatcher = GatedPublicationDispatcher(honorsCancellation: true)
        let outcomes = OutcomeLog()
        let flusher = makeFlusher(dispatcher, outcomes: outcomes)

        let flush = Task { await flusher.flush() }
        await dispatcher.waitUntilUploading()
        let verdict = await OfflineQueue.shared.cancelPendingPublication(clientMutationId: cmid)
        await flush.value

        XCTAssertEqual(verdict, .cancelRequested)
        let posted = await dispatcher.posted
        let interrupted = await dispatcher.uploadWasInterrupted
        XCTAssertEqual(posted, 0, "le POST ne part pas après l'annulation")
        XCTAssertTrue(interrupted, "la Task d'envoi est annulée : la requête en vol est coupée")
        XCTAssertNil(try row(cmid))
        XCTAssertTrue(outcomes.all.isEmpty, "ni .applied ni .exhausted pour une publication retirée")
    }

    func test_cancelPendingPublication_onInflightRow_marksInsteadOfDeleting() async throws {
        let cmid = try await enqueuePublication()
        try await pool.write { db in
            try db.execute(sql: "UPDATE outbox SET status = 'inflight' WHERE id = ?", arguments: ["ofqm_\(cmid)"])
        }

        await OfflineQueue.shared.cancelCreatePost(clientMutationId: cmid)

        let marked = try XCTUnwrap(try row(cmid), "une ligne en vol ne se supprime pas sous les pieds du téléverseur")
        XCTAssertNotNil(marked.cancelRequestedAt)
        let cancelled = await OfflineQueue.shared.isPublicationCancelled(outboxId: "ofqm_\(cmid)")
        XCTAssertTrue(cancelled)
    }

    func test_flush_reclaimedRowCarryingTheMark_isNeverDispatched() async throws {
        let cmid = try await enqueuePublication()
        let stale = Date().addingTimeInterval(-OutboxFlusher.staleInflightReclaimSeconds - 60)
        try await pool.write { db in
            try db.execute(
                sql: "UPDATE outbox SET status = 'inflight', updatedAt = ?, cancelRequestedAt = ? WHERE id = ?",
                arguments: [stale, stale, "ofqm_\(cmid)"]
            )
        }
        let dispatcher = MockOutboxDispatcher()

        await makeFlusher(dispatcher, outcomes: OutcomeLog()).flush()

        let processed = await dispatcher.processedIds
        XCTAssertTrue(processed.isEmpty, "la marque survit au redémarrage : la ligne reprise ne repart pas")
        XCTAssertNil(try row(cmid))
    }

    // MARK: - (c) le POST avait abouti

    func test_cancelPendingPublication_afterThePostLeft_leavesNoStuckRowAndReportsApplied() async throws {
        let cmid = try await enqueuePublication()
        let dispatcher = GatedPublicationDispatcher(honorsCancellation: false)
        let outcomes = OutcomeLog()
        let flusher = makeFlusher(dispatcher, outcomes: outcomes)

        let flush = Task { await flusher.flush() }
        await dispatcher.waitUntilUploading()
        _ = await OfflineQueue.shared.cancelPendingPublication(clientMutationId: cmid)
        await flush.value

        let posted = await dispatcher.posted
        XCTAssertEqual(posted, 1)
        XCTAssertNil(try row(cmid), "aucune ligne ne reste coincée")
        XCTAssertEqual(outcomes.all, [.applied(cmid: cmid)], "le serveur fait foi : la publication est en ligne")
    }

    // MARK: - Bornes

    func test_cancelPendingPublication_onAnotherKind_touchesNothing() async throws {
        let cmid = ClientMutationId.generate()
        try await OfflineQueue.shared.enqueue(
            .repostPost,
            payload: RepostPostPayload(clientMutationId: cmid, postId: "p1", targetType: "POST", content: nil, isQuote: false, visibility: nil),
            conversationId: "p1"
        )

        let verdict = await OfflineQueue.shared.cancelPendingPublication(clientMutationId: cmid)

        XCTAssertEqual(verdict, .notFound)
        XCTAssertNotNil(try row(cmid))
    }

    func test_cancelPendingPublication_onUnknownCmid_isNotFound() async {
        let verdict = await OfflineQueue.shared.cancelPendingPublication(clientMutationId: ClientMutationId.generate())

        XCTAssertEqual(verdict, .notFound)
    }
}

/// Un envoi qui « téléverse » assez longtemps pour qu'on l'annule en vol, et
/// relit la marque avant son `POST` comme le dispatcher de l'app.
private actor GatedPublicationDispatcher: OutboxDispatching {
    private let honorsCancellation: Bool
    private(set) var posted = 0
    private(set) var uploadWasInterrupted = false
    private var uploading = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    init(honorsCancellation: Bool) {
        self.honorsCancellation = honorsCancellation
    }

    func dispatch(_ record: OutboxRecord) async throws {
        try await OfflineQueue.shared.throwIfPublicationCancelled(outboxId: record.id)
        guard honorsCancellation else {
            posted += 1
            markUploading()
            try? await Task.sleep(nanoseconds: 200_000_000)
            return
        }
        markUploading()
        do {
            try await Task.sleep(nanoseconds: 10_000_000_000)
        } catch {
            uploadWasInterrupted = true
            throw error
        }
        try await OfflineQueue.shared.throwIfPublicationCancelled(outboxId: record.id)
        posted += 1
    }

    func waitUntilUploading() async {
        guard !uploading else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    private func markUploading() {
        uploading = true
        waiters.forEach { $0.resume() }
        waiters = []
    }
}

private final class OutcomeLog: @unchecked Sendable {
    private let lock = NSLock()
    private var outcomes: [OutboxOutcome] = []

    var all: [OutboxOutcome] { lock.withLock { outcomes } }

    func append(_ outcome: OutboxOutcome) {
        lock.withLock { outcomes.append(outcome) }
    }
}
