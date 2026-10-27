import XCTest
@testable import Meeshy

/// The held CallKit answer action (#11522): fulfilled at the real connection,
/// failed on a pre-connect teardown, forced by a safety net, released untouched
/// after a CallKit-side timeout.
@MainActor
final class CallKitAnswerActionHoldTests: XCTestCase {

    private final class SpyAction: SettleableCallAction {
        private(set) var fulfillCount = 0
        private(set) var failCount = 0
        func fulfill() { fulfillCount += 1 }
        func fail() { failCount += 1 }
    }

    func test_settle_fulfilled_fulfillsTheHeldActionOnce() {
        let hold = CallKitAnswerActionHold(safetyNetSeconds: 60)
        let action = SpyAction()
        hold.hold(action)
        hold.settle(fulfilled: true, reason: "connected")
        hold.settle(fulfilled: true, reason: "connected")
        XCTAssertEqual(action.fulfillCount, 1)
        XCTAssertEqual(action.failCount, 0)
        XCTAssertFalse(hold.isHolding)
    }

    func test_settle_failed_failsTheHeldAction() {
        let hold = CallKitAnswerActionHold(safetyNetSeconds: 60)
        let action = SpyAction()
        hold.hold(action)
        hold.settle(fulfilled: false, reason: "teardown before connect")
        XCTAssertEqual(action.failCount, 1)
        XCTAssertEqual(action.fulfillCount, 0)
    }

    func test_settle_withoutAHeldAction_isANoOp() {
        let hold = CallKitAnswerActionHold(safetyNetSeconds: 60)
        hold.settle(fulfilled: true, reason: "connected")
        XCTAssertFalse(hold.isHolding)
    }

    func test_hold_aSecondAction_failsTheSupersededOne() {
        let hold = CallKitAnswerActionHold(safetyNetSeconds: 60)
        let first = SpyAction()
        let second = SpyAction()
        hold.hold(first)
        hold.hold(second)
        XCTAssertEqual(first.failCount, 1, "CallKit requires every action to be completed")
        hold.settle(fulfilled: true, reason: "connected")
        XCTAssertEqual(second.fulfillCount, 1)
    }

    func test_safetyNet_fulfillsAnActionStillHeld() async {
        let hold = CallKitAnswerActionHold(safetyNetSeconds: 0.05)
        let action = SpyAction()
        hold.hold(action)
        for _ in 0..<100 where action.fulfillCount == 0 {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertEqual(action.fulfillCount, 1)
        XCTAssertFalse(hold.isHolding)
    }

    func test_safetyNet_isDisarmedBySettlement() async {
        let hold = CallKitAnswerActionHold(safetyNetSeconds: 0.05)
        let action = SpyAction()
        hold.hold(action)
        hold.settle(fulfilled: false, reason: "teardown before connect")
        try? await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(action.fulfillCount, 0)
        XCTAssertEqual(action.failCount, 1)
    }

    func test_discardTimedOut_releasesWithoutCompletingTheAction() {
        let hold = CallKitAnswerActionHold(safetyNetSeconds: 60)
        let action = SpyAction()
        hold.hold(action)
        hold.discardTimedOut(action)
        hold.settle(fulfilled: true, reason: "connected")
        XCTAssertEqual(action.fulfillCount, 0, "CallKit already gave up on it")
        XCTAssertEqual(action.failCount, 0)
        XCTAssertFalse(hold.isHolding)
    }

    func test_discardTimedOut_ofAnotherAction_keepsTheHeldOne() {
        let hold = CallKitAnswerActionHold(safetyNetSeconds: 60)
        let held = SpyAction()
        hold.hold(held)
        hold.discardTimedOut(SpyAction())
        XCTAssertTrue(hold.isHolding)
        hold.settle(fulfilled: true, reason: "connected")
        XCTAssertEqual(held.fulfillCount, 1)
    }
}
