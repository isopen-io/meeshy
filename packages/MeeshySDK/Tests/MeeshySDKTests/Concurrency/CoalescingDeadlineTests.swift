import XCTest
@testable import MeeshySDK

@MainActor
final class CoalescingDeadlineTests: XCTestCase {

    private final class Owner {}

    private func makeDeadline() -> CoalescingDeadline {
        CoalescingDeadline(sleep: { _ in
            await Task.yield()
            return true
        })
    }

    private func drain() async {
        for _ in 0..<50 { await Task.yield() }
        _ = await cancellableSleep(for: .milliseconds(20))
    }

    func test_twoSchedulesForSameOwner_runOnlyTheSecondAction() async {
        let deadline = makeDeadline()
        let owner = Owner()
        let ran = Locked([String]())
        deadline.schedule(for: owner, after: .milliseconds(1)) { ran.mutate { $0.append("first") } }
        deadline.schedule(for: owner, after: .milliseconds(1)) { ran.mutate { $0.append("second") } }
        await drain()
        XCTAssertEqual(ran.read { $0 }, ["second"])
    }

    func test_twoOwners_areIndependent() async {
        let deadline = makeDeadline()
        let a = Owner()
        let b = Owner()
        let ran = Locked([String]())
        deadline.schedule(for: a, after: .milliseconds(1)) { ran.mutate { $0.append("a") } }
        deadline.schedule(for: b, after: .milliseconds(1)) { ran.mutate { $0.append("b") } }
        await drain()
        XCTAssertEqual(Set(ran.read { $0 }), ["a", "b"])
    }

    func test_cancel_preventsTheAction() async {
        let deadline = makeDeadline()
        let owner = Owner()
        let ran = Locked(false)
        deadline.schedule(for: owner, after: .milliseconds(1)) { ran.mutate { $0 = true } }
        deadline.cancel(for: owner)
        await drain()
        XCTAssertFalse(ran.read { $0 })
    }
}
