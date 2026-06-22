import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class EngagementDispatcherTests: XCTestCase {
    private func makeSession(userId: String = "u1") -> EngagementSession {
        EngagementSession(
            sessionId: "s1", userId: userId, postId: "p1", contentType: .post, surface: .detail,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: 4000, watchMs: nil,
            mediaDurationMs: nil, completed: false, truncated: false, consent: "granted",
            actions: [], watchSamples: []
        )
    }

    func test_dispatch_callsRecord_withSession() async {
        let calls = LockBox<[[EngagementSession]]>([])
        let dispatcher = EngagementDispatcher(
            record: { sessions in calls.mutate { $0.append(sessions) } },
            currentUserId: { "u1" })
        let outcome = await dispatcher.dispatch(makeSession())
        XCTAssertEqual(outcome, .completed)
        XCTAssertEqual(calls.value.first?.first?.sessionId, "s1")
    }

    func test_dispatch_dropsSession_whenUserChanged() async {
        let calls = LockBox<Int>(0)
        let dispatcher = EngagementDispatcher(
            record: { _ in calls.mutate { $0 += 1 } },
            currentUserId: { "u2" })   // current user differs from session.userId == "u1"
        let outcome = await dispatcher.dispatch(makeSession())
        XCTAssertEqual(outcome, .failedPermanent, "session owned by another user must be dropped, not flushed")
        XCTAssertEqual(calls.value, 0)
    }

    func test_dispatch_transientFailure_onThrow() async {
        struct Boom: Error {}
        let dispatcher = EngagementDispatcher(record: { _ in throw Boom() }, currentUserId: { "u1" })
        let outcome = await dispatcher.dispatch(makeSession())
        XCTAssertEqual(outcome, .failedTransient)
    }
}

/// Thread-safe box for assertions across the @Sendable record closure.
final class LockBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: T
    init(_ v: T) { _value = v }
    var value: T { lock.lock(); defer { lock.unlock() }; return _value }
    func mutate(_ f: (inout T) -> Void) { lock.lock(); f(&_value); lock.unlock() }
}
