import XCTest
@testable import MeeshySDK

final class SyncEngineStateTests: XCTestCase {

    func test_claim_bySameOwner_isRefused() {
        var ownership = SyncOwnership<String>()
        XCTAssertTrue(ownership.claim("a").claimed)
        XCTAssertFalse(ownership.claim("a").claimed)
    }

    func test_claim_byDifferentOwner_succeedsAndReturnsTheWaitersToRelease() {
        var ownership = SyncOwnership<String>()
        _ = ownership.claim("a")
        XCTAssertFalse(ownership.admit("a", "waiter"))

        let outcome = ownership.claim("b")

        XCTAssertTrue(outcome.claimed)
        XCTAssertEqual(outcome.released, ["waiter"])
        XCTAssertEqual(ownership.owner, "b")
    }

    func test_release_byNonOwner_returnsNothingAndKeepsTheOwner() {
        var ownership = SyncOwnership<String>()
        _ = ownership.claim("a")
        XCTAssertFalse(ownership.admit("a", "waiter"))

        XCTAssertTrue(ownership.release("b").isEmpty)
        XCTAssertEqual(ownership.owner, "a")
        XCTAssertEqual(ownership.release("a"), ["waiter"])
        XCTAssertNil(ownership.owner)
    }

    func test_admit_withNoOwner_saysToResumeAtOnce() {
        var ownership = SyncOwnership<String>()
        XCTAssertTrue(ownership.admit("a", "waiter"))
        XCTAssertTrue(ownership.release("a").isEmpty)
    }

    func test_admit_whileOwnerHoldsTheLock_queuesTheWaiter() {
        var ownership = SyncOwnership<String>()
        _ = ownership.claim("a")
        XCTAssertFalse(ownership.admit("a", "w1"))
        XCTAssertFalse(ownership.admit("a", "w2"))
        XCTAssertEqual(ownership.release("a"), ["w1", "w2"])
    }

    func test_admit_forAnotherOwnerThanTheHolder_resumesAtOnce() {
        var ownership = SyncOwnership<String>()
        _ = ownership.claim("a")
        XCTAssertTrue(ownership.admit("b", "waiter"))
    }

    func test_takeReconnectCatchUp_consumesTheRequestOnce() {
        var state = SyncEngineState()
        XCTAssertFalse(state.takeReconnectCatchUp())
        state.reconnectCatchUpPending = true
        XCTAssertTrue(state.takeReconnectCatchUp())
        XCTAssertFalse(state.takeReconnectCatchUp())
    }

    func test_lastDeltaSyncAt_startsAtDistantPast() {
        XCTAssertEqual(SyncEngineState().lastDeltaSyncAt, .distantPast)
    }
}
