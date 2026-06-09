import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// Tests for `OfflineQueue.pendingUIItemsPublisher` — the Combine snapshot
/// of pending/inflight/failed outbox rows that feeds the `SyncPill` UI.
///
/// Each test wires a fresh in-memory `DatabaseQueue`, runs the outbox
/// migrations, and configures the singleton with that pool so the publisher
/// emits a deterministic snapshot. `clearAll()` plus a manual `DELETE FROM
/// outbox` keep adjacent tests from leaking rows into each other.
final class OfflineQueuePendingUIItemsPublisherTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private var pool: DatabaseQueue!

    override func setUp() async throws {
        try await super.setUp()
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await queue.configure(pool: pool)
        await queue.clearAll()
        try await pool.write { db in
            try db.execute(sql: "DELETE FROM outbox")
        }
        // Force a refresh so the subject reflects the cleared table.
        await queue.refreshForTesting()
    }

    override func tearDown() async throws {
        await queue.clearAll()
        try? await pool.write { db in
            try db.execute(sql: "DELETE FROM outbox")
        }
        pool = nil
        try await super.tearDown()
    }

    // MARK: - Empty queue

    func test_publisher_emits_empty_when_queue_empty() async throws {
        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }

        try await Task.sleep(nanoseconds: 100_000_000)
        cancellable.cancel()

        let received = recorder.snapshot()
        XCTAssertEqual(received.last, [],
            "Empty outbox MUST publish an empty snapshot")
    }

    // MARK: - Single enqueue surfaces

    func test_publisher_emits_one_after_enqueue_send_message() async throws {
        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }

        let item = OfflineQueueItem(
            conversationId: "conv-pub-1",
            content: "Hello pill",
            clientMessageId: "cid_pub_one"
        )
        try await queue.enqueue(item)

        try await Task.sleep(nanoseconds: 200_000_000)
        cancellable.cancel()

        let received = recorder.snapshot()
        guard let last = received.last else {
            return XCTFail("Publisher never emitted")
        }
        XCTAssertEqual(last.count, 1, "Single enqueue MUST surface exactly one row")
        XCTAssertEqual(last.first?.kind, .message)
        XCTAssertEqual(last.first?.titlePreview, "Hello pill")
        XCTAssertEqual(last.first?.status, .pending)
    }

    // MARK: - Ordering

    func test_publisher_orders_by_created_at_ascending() async throws {
        // Insert rows directly so we can control `createdAt` precisely.
        let early = Date(timeIntervalSince1970: 1_750_000_000)
        let later = Date(timeIntervalSince1970: 1_750_000_500)
        let latest = Date(timeIntervalSince1970: 1_750_001_000)
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_order_b",
                kind: .sendMessage,
                conversationId: "conv-order",
                clientMessageId: "cid_order_b",
                payload: Self.encodedSendPayload(content: "second", cmid: "cid_order_b"),
                status: .pending,
                createdAt: later,
                updatedAt: later,
                nextAttemptAt: later
            ).insert(db)
            try OutboxRecord(
                id: "ofq_order_a",
                kind: .sendMessage,
                conversationId: "conv-order",
                clientMessageId: "cid_order_a",
                payload: Self.encodedSendPayload(content: "first", cmid: "cid_order_a"),
                status: .pending,
                createdAt: early,
                updatedAt: early,
                nextAttemptAt: early
            ).insert(db)
            try OutboxRecord(
                id: "ofq_order_c",
                kind: .sendMessage,
                conversationId: "conv-order",
                clientMessageId: "cid_order_c",
                payload: Self.encodedSendPayload(content: "third", cmid: "cid_order_c"),
                status: .pending,
                createdAt: latest,
                updatedAt: latest,
                nextAttemptAt: latest
            ).insert(db)
        }
        await queue.refreshForTesting()

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }
        try await Task.sleep(nanoseconds: 150_000_000)
        cancellable.cancel()

        let received = recorder.snapshot()
        guard let last = received.last else {
            return XCTFail("Publisher never emitted")
        }
        XCTAssertEqual(last.map(\.id), ["ofq_order_a", "ofq_order_b", "ofq_order_c"],
            "Rows MUST be sorted by createdAt ascending")
    }

    // MARK: - Successfully drained rows disappear

    func test_publisher_excludes_successfully_drained_rows() async throws {
        let item = OfflineQueueItem(
            conversationId: "conv-drain",
            content: "to be drained",
            clientMessageId: "cid_drain"
        )
        try await queue.enqueue(item)

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }
        try await Task.sleep(nanoseconds: 100_000_000)

        // Simulate a successful drain: the outbox row is DELETED (not marked
        // as applied — `OutboxStatus` has no `.applied` case). After deletion
        // the publisher MUST drop the row.
        try await queue.deleteForTesting(clientMessageId: "cid_drain")
        try await Task.sleep(nanoseconds: 200_000_000)
        cancellable.cancel()

        let received = recorder.snapshot()
        guard let last = received.last else {
            return XCTFail("Publisher never emitted")
        }
        XCTAssertEqual(last, [], "Drained (deleted) rows MUST disappear from the publisher snapshot")
    }

    // MARK: - Failed rows stay visible

    func test_publisher_includes_failed_status() async throws {
        let item = OfflineQueueItem(
            conversationId: "conv-failed",
            content: "boom",
            clientMessageId: "cid_failed"
        )
        try await queue.enqueue(item)

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }

        try await queue.markFailedForTesting(clientMessageId: "cid_failed", reason: "test failure")
        try await Task.sleep(nanoseconds: 200_000_000)
        cancellable.cancel()

        let received = recorder.snapshot()
        guard let last = received.last else {
            return XCTFail("Publisher never emitted")
        }
        XCTAssertEqual(last.count, 1, "Failed rows MUST remain visible in the publisher snapshot")
        XCTAssertEqual(last.first?.status, .failed)
        XCTAssertEqual(last.first?.titlePreview, "boom")
    }

    // MARK: - Exhausted rows surface (T14b)

    func test_publisher_surfaces_exhausted_rows() async throws {
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_exhausted",
                kind: .blockUser,
                conversationId: "conv-ex",
                clientMessageId: "cid_ex",
                payload: Data(),
                status: .exhausted,
                attempts: 5,
                lastError: "gave up",
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }
        await queue.refreshForTesting()

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher.sink { recorder.append($0) }
        try await Task.sleep(nanoseconds: 200_000_000)
        cancellable.cancel()

        let last = recorder.snapshot().last ?? []
        XCTAssertEqual(last.count, 1, "an exhausted (permanently failed) row MUST surface in the SyncPill snapshot")
        XCTAssertEqual(last.first?.status, .exhausted)
    }

    // MARK: - markAsRead is a background read-receipt, never a user-facing op

    /// `markAsRead` rows (`countsTowardSyncIndicator == false`) MUST NOT surface
    /// in the SyncPill snapshot. They are idempotent background read receipts:
    /// surfacing them shows the user "Synchronisation des lus" for conversations
    /// they merely opened, contradicting `pendingCountPublisher` (which already
    /// excludes them) and polluting the rotation with phantom operations.
    func test_publisher_excludes_markAsRead_kind() async throws {
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        try await pool.write { db in
            // A genuine user op that MUST stay visible.
            try OutboxRecord(
                id: "ofq_send_visible",
                kind: .sendMessage,
                conversationId: "conv-mix",
                clientMessageId: "cid_send_visible",
                payload: Self.encodedSendPayload(content: "real message", cmid: "cid_send_visible"),
                status: .pending,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
            // A background read receipt that MUST be filtered out.
            try OutboxRecord(
                id: "ofqm_markread",
                kind: .markAsRead,
                conversationId: "conv-mix",
                clientMessageId: "cmid_markread",
                payload: Data(),
                status: .pending,
                createdAt: now.addingTimeInterval(1),
                updatedAt: now.addingTimeInterval(1),
                nextAttemptAt: now.addingTimeInterval(1)
            ).insert(db)
        }
        await queue.refreshForTesting()

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher.sink { recorder.append($0) }
        try await Task.sleep(nanoseconds: 200_000_000)
        cancellable.cancel()

        let last = recorder.snapshot().last ?? []
        XCTAssertEqual(last.map(\.id), ["ofq_send_visible"],
            "markAsRead rows MUST be excluded from the SyncPill snapshot; only the real sendMessage stays")
    }

    // MARK: - Helpers

    private static func encodedSendPayload(content: String, cmid: String) -> Data {
        let item = OfflineQueueItem(
            conversationId: "conv-order",
            content: content,
            clientMessageId: cmid
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return (try? encoder.encode(item)) ?? Data()
    }
}
