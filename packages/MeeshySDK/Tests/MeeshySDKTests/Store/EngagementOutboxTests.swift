import XCTest
import GRDB
@testable import MeeshySDK

final class EngagementOutboxTests: XCTestCase {
    private func makeOutbox() -> EngagementOutbox {
        let path = FileManager.default.temporaryDirectory
            .appendingPathComponent("engagement-\(UUID().uuidString).db").path
        return EngagementOutbox(dbPath: path)
    }

    private func makeSession(_ id: String, dwellMs: Int = 4000) -> EngagementSession {
        EngagementSession(
            sessionId: id, userId: "u1", postId: "p1", contentType: .post, surface: .detail,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: dwellMs,
            watchMs: nil, mediaDurationMs: nil, completed: false, truncated: false,
            consent: "granted", actions: [], watchSamples: []
        )
    }

    func test_openSession_isNotDispatched() async {
        let outbox = makeOutbox()
        await outbox.beginSession(makeSession("s1"))   // lifecycle = .open

        let dispatched = SyncBox<[String]>([])
        await outbox.flush { sessions in
            dispatched.mutate { $0.append(contentsOf: sessions.map(\.sessionId)) }
            return .completed
        }
        XCTAssertEqual(dispatched.value, [], "open sessions must be invisible to dispatch")
    }

    func test_finalizedSession_isDispatchedThenDeleted() async {
        let outbox = makeOutbox()
        await outbox.beginSession(makeSession("s1"))
        await outbox.finalizeSession(makeSession("s1", dwellMs: 5000))   // → .finalized

        let dispatched = SyncBox<[String]>([])
        await outbox.flush { sessions in
            dispatched.mutate { $0.append(contentsOf: sessions.map(\.sessionId)) }
            return .completed
        }
        XCTAssertEqual(dispatched.value, ["s1"])

        // Second flush: rows deleted on success → nothing left.
        let again = SyncBox<[String]>([])
        await outbox.flush { sessions in again.mutate { $0.append(contentsOf: sessions.map(\.sessionId)) }; return .completed }
        XCTAssertEqual(again.value, [])
    }

    func test_flush_dispatchesAllFinalizedRowsInOneBatchCall() async {
        let outbox = makeOutbox()
        for i in 1...4 {
            await outbox.beginSession(makeSession("s\(i)"))
            await outbox.finalizeSession(makeSession("s\(i)", dwellMs: 5000))
        }

        let calls = SyncBox<[Int]>([])   // one entry per dispatch call, value = batch size
        await outbox.flush { sessions in
            calls.mutate { $0.append(sessions.count) }
            return .completed
        }
        XCTAssertEqual(calls.value, [4],
                       "the whole batch must go out in ONE POST, not one-per-session (429 hammering fix)")
    }

    func test_flush_transientFailure_bumpsAllRowsForRetry() async {
        let clock = SyncBox<Date>(Date(timeIntervalSince1970: 1_700_000_000))
        let path = FileManager.default.temporaryDirectory
            .appendingPathComponent("engagement-\(UUID().uuidString).db").path
        let outbox = EngagementOutbox(dbPath: path, clock: { clock.value })
        for i in 1...3 {
            await outbox.beginSession(makeSession("s\(i)"))
            await outbox.finalizeSession(makeSession("s\(i)", dwellMs: 5000))
        }

        // Transient failure → rows kept with a future next_retry_at, so an
        // immediate re-flush (same clock) sees nothing ready.
        await outbox.flush { _ in .failedTransient }
        let immediate = SyncBox<[String]>([])
        await outbox.flush { sessions in immediate.mutate { $0.append(contentsOf: sessions.map(\.sessionId)) }; return .completed }
        XCTAssertEqual(immediate.value, [], "transiently-failed rows must back off, not re-dispatch instantly")

        // After the backoff window, they become ready again.
        clock.mutate { $0 = Date(timeIntervalSince1970: 1_700_000_000 + 3600) }
        let later = SyncBox<[String]>([])
        await outbox.flush { sessions in later.mutate { $0.append(contentsOf: sessions.map(\.sessionId)) }; return .completed }
        XCTAssertEqual(Set(later.value), ["s1", "s2", "s3"], "rows re-dispatch once the backoff elapses")
    }

    func test_bootSweep_finalizesOrphanOpenSessions_truncated() async {
        let path = FileManager.default.temporaryDirectory
            .appendingPathComponent("engagement-\(UUID().uuidString).db").path
        let first = EngagementOutbox(dbPath: path)
        await first.beginSession(makeSession("s1"))   // simulate crash: stays .open

        let recovered = EngagementOutbox(dbPath: path)  // re-open same file
        await recovered.bootSweep()

        let dispatched = SyncBox<[EngagementSession]>([])
        await recovered.flush { sessions in dispatched.mutate { $0.append(contentsOf: sessions) }; return .completed }
        XCTAssertEqual(dispatched.value.map(\.sessionId), ["s1"])
        XCTAssertTrue(dispatched.value.first?.truncated == true)
    }

    func test_flush_whenTaskCancelled_skipsDispatchEntirely() async {
        let outbox = makeOutbox()
        for i in 1...5 {
            await outbox.beginSession(makeSession("s\(i)"))
            await outbox.finalizeSession(makeSession("s\(i)", dwellMs: 5000))
        }

        let dispatched = SyncBox<Int>(0)
        let task = Task {
            // Cancel THIS task synchronously before flush runs → the guard sees
            // it deterministically (no cross-thread race).
            withUnsafeCurrentTask { $0?.cancel() }
            await outbox.flush { sessions in
                dispatched.mutate { $0 += sessions.count }
                return .completed
            }
        }
        await task.value

        XCTAssertEqual(dispatched.value, 0,
                       "an already-cancelled flush must skip the dispatch (bounded-caller budget spent)")
    }

    func test_purge_dropsRowsOlderThanCutoff() async {
        let outbox = makeOutbox()
        await outbox.beginSession(makeSession("old"))
        await outbox.finalizeSession(makeSession("old"))
        await outbox.purge(olderThan: Date(timeIntervalSince1970: 9_999_999_999), maxRows: 5000)

        let dispatched = SyncBox<[String]>([])
        await outbox.flush { sessions in dispatched.mutate { $0.append(contentsOf: sessions.map(\.sessionId)) }; return .completed }
        XCTAssertEqual(dispatched.value, [], "rows older than cutoff are purged before flush")
    }
}

/// Tiny thread-safe box for test assertions across the actor boundary.
final class SyncBox<T>: @unchecked Sendable {
    private let lock = NSLock(); private var _value: T
    init(_ v: T) { _value = v }
    var value: T { lock.lock(); defer { lock.unlock() }; return _value }
    func mutate(_ f: (inout T) -> Void) { lock.lock(); f(&_value); lock.unlock() }
}
