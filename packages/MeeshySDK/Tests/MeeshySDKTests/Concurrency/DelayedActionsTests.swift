import XCTest
@testable import MeeshySDK

@MainActor
final class DelayedActionsTests: XCTestCase {

    private func instant() -> DelayedActions {
        DelayedActions(sleep: { _ in
            await Task.yield()
            return true
        })
    }

    private func neverFires() -> DelayedActions {
        DelayedActions(sleep: { _ in await cancellableSleep(for: .seconds(60)) })
    }

    private func drain() async {
        for _ in 0..<50 { await Task.yield() }
        _ = await cancellableSleep(for: .milliseconds(20))
    }

    func test_run_afterDelay_performsOnce() async {
        let actions = instant()
        let ran = Locked(0)
        actions.run(after: .milliseconds(1)) { ran.mutate { $0 += 1 } }
        await drain()
        XCTAssertEqual(ran.read { $0 }, 1)
    }

    func test_run_twiceBeforeFiring_performsBoth() async {
        let actions = instant()
        let ran = Locked([String]())
        actions.run(after: .milliseconds(1)) { ran.mutate { $0.append("a") } }
        actions.run(after: .milliseconds(1)) { ran.mutate { $0.append("b") } }
        await drain()
        XCTAssertEqual(Set(ran.read { $0 }), ["a", "b"])
        XCTAssertEqual(ran.read { $0.count }, 2)
    }

    func test_release_cancelsPending_actionNeverRuns() async {
        let ran = Locked(false)
        do {
            let actions = neverFires()
            actions.run(after: .seconds(60)) { ran.mutate { $0 = true } }
        }
        await drain()
        XCTAssertFalse(ran.read { $0 })
    }

    func test_cancelAll_preventsPending_andLaterRunStillWorks() async {
        let actions = DelayedActions(sleep: { _ in
            await Task.yield()
            await Task.yield()
            return true
        })
        let ran = Locked([String]())
        actions.run(after: .milliseconds(1)) { ran.mutate { $0.append("cancelled") } }
        actions.cancelAll()
        actions.run(after: .milliseconds(1)) { ran.mutate { $0.append("later") } }
        await drain()
        XCTAssertEqual(ran.read { $0 }, ["later"])
    }

    func test_performedAction_isForgotten_hasPendingFalse() async {
        let actions = instant()
        actions.run(after: .milliseconds(1)) {}
        let before = actions.hasPending
        await drain()
        let after = actions.hasPending
        XCTAssertTrue(before)
        XCTAssertFalse(after)
    }
}
