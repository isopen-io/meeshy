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
        await outbox.flush { session in
            dispatched.mutate { $0.append(session.sessionId) }
            return .completed
        }
        XCTAssertEqual(dispatched.value, [], "open sessions must be invisible to dispatch")
    }

    func test_finalizedSession_isDispatchedThenDeleted() async {
        let outbox = makeOutbox()
        await outbox.beginSession(makeSession("s1"))
        await outbox.finalizeSession(makeSession("s1", dwellMs: 5000))   // → .finalized

        let dispatched = SyncBox<[String]>([])
        await outbox.flush { session in
            dispatched.mutate { $0.append(session.sessionId) }
            return .completed
        }
        XCTAssertEqual(dispatched.value, ["s1"])

        // Second flush: row deleted on success → nothing left.
        let again = SyncBox<[String]>([])
        await outbox.flush { s in again.mutate { $0.append(s.sessionId) }; return .completed }
        XCTAssertEqual(again.value, [])
    }

    func test_bootSweep_finalizesOrphanOpenSessions_truncated() async {
        let path = FileManager.default.temporaryDirectory
            .appendingPathComponent("engagement-\(UUID().uuidString).db").path
        let first = EngagementOutbox(dbPath: path)
        await first.beginSession(makeSession("s1"))   // simulate crash: stays .open

        let recovered = EngagementOutbox(dbPath: path)  // re-open same file
        await recovered.bootSweep()

        let dispatched = SyncBox<[EngagementSession]>([])
        await recovered.flush { s in dispatched.mutate { $0.append(s) }; return .completed }
        XCTAssertEqual(dispatched.value.map(\.sessionId), ["s1"])
        XCTAssertTrue(dispatched.value.first?.truncated == true)
    }

    func test_flush_whenTaskCancelled_stopsBeforeDispatchingEveryRow() async {
        let outbox = makeOutbox()
        for i in 1...5 {
            await outbox.beginSession(makeSession("s\(i)"))
            await outbox.finalizeSession(makeSession("s\(i)"))
        }

        let dispatched = SyncBox<[String]>([])
        let task = Task {
            await outbox.flush { session in
                dispatched.mutate { $0.append(session.sessionId) }
                return .completed
            }
        }
        task.cancel()   // budget spent → the loop must break, not dispatch all 5
        await task.value

        XCTAssertLessThan(dispatched.value.count, 5,
                          "a cancelled flush must break before dispatching every finalized row")
    }

    func test_purge_dropsRowsOlderThanCutoff() async {
        let outbox = makeOutbox()
        await outbox.beginSession(makeSession("old"))
        await outbox.finalizeSession(makeSession("old"))
        await outbox.purge(olderThan: Date(timeIntervalSince1970: 9_999_999_999), maxRows: 5000)

        let dispatched = SyncBox<[String]>([])
        await outbox.flush { s in dispatched.mutate { $0.append(s.sessionId) }; return .completed }
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
