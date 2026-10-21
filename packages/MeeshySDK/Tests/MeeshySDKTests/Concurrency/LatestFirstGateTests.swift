import XCTest
@testable import MeeshySDK

final class LatestFirstGateTests: XCTestCase {

    private func settle() async {
        _ = await cancellableSleep(for: .milliseconds(30))
    }

    func test_leave_handsTheSlotToTheMostRecentWaiter() async {
        let gate = LatestFirstGate(limit: 2)
        let order = Locked([String]())
        let first = await gate.enter()
        let second = await gate.enter()
        XCTAssertTrue(first && second)
        let older = Task {
            let admitted = await gate.enter()
            order.mutate { $0.append("older") }
            return admitted
        }
        await settle()
        let newer = Task {
            let admitted = await gate.enter()
            order.mutate { $0.append("newer") }
            return admitted
        }
        await settle()
        await gate.leave()
        let newerOutcome = await newer.value
        XCTAssertTrue(newerOutcome)
        XCTAssertEqual(order.read { $0 }, ["newer"])
        await gate.leave()
        let olderOutcome = await older.value
        XCTAssertTrue(olderOutcome)
        XCTAssertEqual(order.read { $0 }, ["newer", "older"])
    }

    func test_cancelledWaiter_returnsFalseWithoutConsumingASlot() async {
        let gate = LatestFirstGate(limit: 1)
        _ = await gate.enter()
        let waiting = Task { await gate.enter() }
        await settle()
        waiting.cancel()
        let waitingOutcome = await waiting.value
        XCTAssertFalse(waitingOutcome)
        await gate.leave()
        let reentered = await gate.enter()
        XCTAssertTrue(reentered)
    }
}
