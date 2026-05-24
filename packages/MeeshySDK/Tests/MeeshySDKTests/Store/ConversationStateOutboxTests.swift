import XCTest
@testable import MeeshySDK

final class ConversationStateOutboxTests: XCTestCase {

    // MARK: - Helpers

    private func makeOutbox(now: Date = Date(timeIntervalSince1970: 0)) -> ConversationStateOutbox {
        let tmpDir = FileManager.default.temporaryDirectory
        let path = tmpDir.appendingPathComponent("outbox-\(UUID().uuidString).db").path
        return ConversationStateOutbox(dbPath: path, clock: { now })
    }

    private func makeOutboxWithMovingClock() -> (ConversationStateOutbox, () -> Void) {
        let tmpDir = FileManager.default.temporaryDirectory
        let path = tmpDir.appendingPathComponent("outbox-\(UUID().uuidString).db").path
        let clock = MutableClock()
        let outbox = ConversationStateOutbox(dbPath: path, clock: { clock.now })
        return (outbox, { clock.advance(by: 1_000_000) }) // 1M seconds → past any backoff
    }

    final class MutableClock: @unchecked Sendable {
        private var current: Date = Date(timeIntervalSince1970: 0)
        var now: Date { current }
        func advance(by seconds: TimeInterval) { current = current.addingTimeInterval(seconds) }
    }

    // MARK: - Enqueue + persistence

    func test_enqueue_persistsTask() async {
        let outbox = makeOutbox()
        let task = await outbox.enqueue(.setPinned(true), for: "conv-1")
        XCTAssertNotNil(task)
        let all = await outbox.allPending()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.convId, "conv-1")
    }

    func test_enqueue_localOnlyMutationIsRejected() async {
        let outbox = makeOutbox()
        let task = await outbox.enqueue(.setLocked(true), for: "conv-1")
        XCTAssertNil(task, ".setLocked is local-only and must never enter the outbox")
        let count = await outbox.pendingCount(for: "conv-1")
        XCTAssertEqual(count, 0)
    }

    // MARK: - Coalescing

    func test_coalescing_setPinnedTwiceOverwrites() async {
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.setPinned(true), for: "conv-1")
        _ = await outbox.enqueue(.setPinned(false), for: "conv-1")
        let all = await outbox.allPending()
        XCTAssertEqual(all.count, 1, "Same field overwrite must coalesce")
        XCTAssertEqual(all.first?.mutation, .setPinned(false))
    }

    func test_coalescing_differentFieldsDoNotCoalesce() async {
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.setPinned(true), for: "conv-1")
        _ = await outbox.enqueue(.setMuted(true), for: "conv-1")
        let count = await outbox.pendingCount(for: "conv-1")
        XCTAssertEqual(count, 2)
    }

    func test_coalescing_setTagsOverwritesPriorTagMutations() async {
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.setTags(["a", "b"]), for: "conv-1")
        _ = await outbox.enqueue(.setTags(["c"]), for: "conv-1")
        let all = await outbox.allPending()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.mutation, .setTags(["c"]))
    }

    func test_coalescing_addTagAfterSetTagsOverwrites() async {
        // Per coalescing key design: all tag-related mutations share the
        // "tags" key, so the last one wins at the outbox level. The
        // Store is responsible for fusing the deltas before enqueueing
        // if it needs to preserve them.
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.setTags(["a"]), for: "conv-1")
        _ = await outbox.enqueue(.addTag("b"), for: "conv-1")
        let all = await outbox.allPending()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.mutation, .addTag("b"))
    }

    func test_coalescing_markReadAndUnreadShareKey_lastWins() async {
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.markAsRead, for: "conv-1")
        _ = await outbox.enqueue(.markAsUnread, for: "conv-1")
        let all = await outbox.allPending()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.mutation, .markAsUnread)
    }

    func test_coalescing_deleteForUserNeverCoalesces() async {
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.deleteForUser, for: "conv-1")
        _ = await outbox.enqueue(.deleteForUser, for: "conv-1")
        let count = await outbox.pendingCount(for: "conv-1")
        XCTAssertEqual(count, 2, ".deleteForUser must never coalesce")
    }

    func test_coalescing_leaveNeverCoalesces() async {
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.leave, for: "conv-1")
        _ = await outbox.enqueue(.leave, for: "conv-1")
        let count = await outbox.pendingCount(for: "conv-1")
        XCTAssertEqual(count, 2)
    }

    func test_coalescing_acrossDifferentConversations() async {
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.setPinned(true), for: "conv-A")
        _ = await outbox.enqueue(.setPinned(true), for: "conv-B")
        let countA = await outbox.pendingCount(for: "conv-A")
        let countB = await outbox.pendingCount(for: "conv-B")
        XCTAssertEqual(countA, 1)
        XCTAssertEqual(countB, 1)
    }

    // MARK: - Flush + retry

    func test_flush_dispatchesAllReadyTasks_inCreatedAtOrder() async {
        let outbox = makeOutbox(now: Date(timeIntervalSince1970: 0))
        _ = await outbox.enqueue(.setPinned(true), for: "c1")
        _ = await outbox.enqueue(.setMuted(true), for: "c1")

        let dispatched = SyncArray<String>()
        await outbox.flush { task in
            await dispatched.append(task.mutation.coalescingKey)
            return .completed
        }
        let result = await dispatched.snapshot()
        XCTAssertEqual(result, ["setPinned", "setMuted"])
        let remaining = await outbox.allPending()
        XCTAssertTrue(remaining.isEmpty)
    }

    func test_flush_transientFailureKeepsTaskAndBumpsAttempts() async {
        let outbox = makeOutbox(now: Date(timeIntervalSince1970: 0))
        let task = await outbox.enqueue(.setPinned(true), for: "c1")!
        await outbox.flush { _ in .failedTransient(reason: "network") }

        let remaining = await outbox.allPending()
        XCTAssertEqual(remaining.count, 1)
        let updated = remaining.first { $0.id == task.id }
        XCTAssertEqual(updated?.attempts, 1)
        XCTAssertNotNil(updated?.nextRetryAt)
    }

    func test_flush_permanentFailureDropsTask() async {
        let outbox = makeOutbox()
        _ = await outbox.enqueue(.setPinned(true), for: "c1")
        await outbox.flush { _ in .failedPermanent(reason: "validation") }
        let remaining = await outbox.allPending()
        XCTAssertTrue(remaining.isEmpty)
    }

    func test_flush_skipsTasksWhoseRetryIsInTheFuture() async {
        let clock = ConversationStateOutboxTests.MutableClock()
        let tmpDir = FileManager.default.temporaryDirectory
        let path = tmpDir.appendingPathComponent("outbox-\(UUID().uuidString).db").path
        let outbox = ConversationStateOutbox(dbPath: path, clock: { clock.now })

        _ = await outbox.enqueue(.setPinned(true), for: "c1")
        // First flush → transient failure → nextRetryAt = now + 5s.
        await outbox.flush { _ in .failedTransient(reason: "x") }

        // Second flush immediately: should NOT dispatch (retry in 5s).
        let dispatched = SyncArray<UUID>()
        await outbox.flush { task in
            await dispatched.append(task.id)
            return .completed
        }
        let snap0 = await dispatched.snapshot()
        let pending0 = await outbox.allPending()
        XCTAssertEqual(snap0, [])
        XCTAssertEqual(pending0.count, 1)

        // Advance past the backoff window.
        clock.advance(by: 10)
        await outbox.flush { task in
            await dispatched.append(task.id)
            return .completed
        }
        let snap1 = await dispatched.snapshot()
        let pending1 = await outbox.allPending()
        XCTAssertEqual(snap1.count, 1)
        XCTAssertTrue(pending1.isEmpty)
    }

    // MARK: - Concurrency: overwrite during dispatch

    func test_concurrency_overwriteDuringDispatch_preservesNewMutation() async {
        let outbox = makeOutbox(now: Date(timeIntervalSince1970: 0))
        _ = await outbox.enqueue(.setPinned(true), for: "c1")

        // The dispatch closure overwrites the task before returning,
        // simulating a user toggling the pref again while the first
        // network call is in flight.
        await outbox.flush { task in
            // Mid-flight, a new enqueue coalesces the task with a new
            // mutation. The outcome below applies to the OLD mutation;
            // the outbox MUST keep the new mutation pending instead of
            // dropping it.
            _ = await outbox.enqueue(.setPinned(false), for: "c1")
            return .completed
        }

        let remaining = await outbox.allPending()
        XCTAssertEqual(remaining.count, 1, "Overwriting mutation must not be dropped by stale dispatch outcome")
        XCTAssertEqual(remaining.first?.mutation, .setPinned(false))
    }

    // MARK: - Backoff

    func test_backoff_isExponentialCappedAt60s() {
        XCTAssertEqual(OutboxBackoff.nextDelay(forAttempts: 0), 5)
        XCTAssertEqual(OutboxBackoff.nextDelay(forAttempts: 1), 10)
        XCTAssertEqual(OutboxBackoff.nextDelay(forAttempts: 2), 20)
        XCTAssertEqual(OutboxBackoff.nextDelay(forAttempts: 3), 40)
        XCTAssertEqual(OutboxBackoff.nextDelay(forAttempts: 4), 60, "Capped at 60s")
        XCTAssertEqual(OutboxBackoff.nextDelay(forAttempts: 10), 60, "Stays capped")
    }

    // MARK: - Persistence across instances (simulates app kill)

    func test_persistence_tasksSurviveAcrossInstances() async {
        let tmpDir = FileManager.default.temporaryDirectory
        let path = tmpDir.appendingPathComponent("outbox-persist-\(UUID().uuidString).db").path
        let outbox1 = ConversationStateOutbox(dbPath: path)
        _ = await outbox1.enqueue(.setPinned(true), for: "c1")
        _ = await outbox1.enqueue(.setMuted(true), for: "c1")
        // Give the init Task time to write to disk.
        try? await Task.sleep(nanoseconds: 50_000_000)

        let outbox2 = ConversationStateOutbox(dbPath: path)
        // Wait for hydrate-on-init to finish.
        try? await Task.sleep(nanoseconds: 200_000_000)
        let restored = await outbox2.allPending()
        XCTAssertEqual(restored.count, 2)
        XCTAssertTrue(restored.contains { $0.mutation == .setPinned(true) })
        XCTAssertTrue(restored.contains { $0.mutation == .setMuted(true) })
    }
}

// MARK: - Test utility

/// Sendable counterpart of an array for accumulating values inside
/// `@Sendable` closures handed to the outbox.
actor SyncArray<Element: Sendable> {
    private var storage: [Element] = []
    func append(_ value: Element) { storage.append(value) }
    func snapshot() -> [Element] { storage }
}
