import XCTest
@testable import MeeshySDK

final class WaiterTableTests: XCTestCase {

    private typealias Table = WaiterTable<Bool, String>

    func test_resolveAllBeforeAttach_deliversValueAtAttachAndLeavesNoWaiter() {
        var table = Table()
        let ticket = table.enroll()
        XCTAssertTrue(table.resolveAll(with: true).isEmpty)
        XCTAssertEqual(table.attach(ticket, "w"), true)
        XCTAssertEqual(table.liveCount, 0)
        XCTAssertTrue(table.resolveAll(with: true).isEmpty)
    }

    func test_attachThenResolveAll_returnsWaiter_andLaterCancelReturnsNil() {
        var table = Table()
        let ticket = table.enroll()
        XCTAssertNil(table.attach(ticket, "w"))
        XCTAssertEqual(table.resolveAll(with: true), ["w"])
        XCTAssertNil(table.cancel(ticket, with: false))
    }

    func test_cancelEnrolled_makesAttachReturnCancellationValue() {
        var table = Table()
        let ticket = table.enroll()
        XCTAssertNil(table.cancel(ticket, with: false))
        XCTAssertEqual(table.attach(ticket, "w"), false)
        XCTAssertEqual(table.liveCount, 0)
    }

    func test_cancelAttached_returnsWaiterAndRemovesIt() {
        var table = Table()
        let ticket = table.enroll()
        _ = table.attach(ticket, "w")
        XCTAssertEqual(table.cancel(ticket, with: false), "w")
        XCTAssertEqual(table.liveCount, 0)
        XCTAssertTrue(table.resolveAll(with: true).isEmpty)
    }

    func test_resolveLatest_handsToHighestLiveTicketAndSkipsCancelled() {
        var table = Table()
        let first = table.enroll()
        let second = table.enroll()
        let third = table.enroll()
        _ = table.attach(first, "first")
        _ = table.attach(second, "second")
        _ = table.attach(third, "third")
        _ = table.cancel(third, with: false)
        let outcome = table.resolveLatest(with: true)
        XCTAssertTrue(outcome.handed)
        XCTAssertEqual(outcome.waiter, "second")
        XCTAssertEqual(table.liveCount, 1)
    }

    func test_resolveLatest_withNothingLive_reportsNotHanded() {
        var table = Table()
        let ticket = table.enroll()
        _ = table.cancel(ticket, with: false)
        let outcome = table.resolveLatest(with: true)
        XCTAssertFalse(outcome.handed)
        XCTAssertNil(outcome.waiter)
    }

    func test_liveCount_excludesCancelledAndResolvedTickets() {
        var table = Table()
        let a = table.enroll()
        let b = table.enroll()
        _ = table.enroll()
        _ = table.attach(a, "a")
        _ = table.cancel(b, with: false)
        XCTAssertEqual(table.liveCount, 2)
        _ = table.resolveAll(with: true)
        XCTAssertEqual(table.liveCount, 0)
    }
}
