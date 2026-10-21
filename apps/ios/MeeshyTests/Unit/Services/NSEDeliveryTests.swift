import XCTest
import os

final class NSEDeliveryTests: XCTestCase {

    private func makeCounter() -> OSAllocatedUnfairLock<[Int]> {
        OSAllocatedUnfairLock(initialState: [])
    }

    func test_deliver_callsTheHandlerOnceWithTheContent() {
        let received = makeCounter()
        let delivery = NSEDelivery<Int> { content in received.withLock { $0.append(content) } }

        XCTAssertTrue(delivery.deliver(7))

        XCTAssertEqual(received.withLock { $0 }, [7])
        XCTAssertTrue(delivery.hasDelivered)
    }

    func test_secondDeliver_isIgnored() {
        let received = makeCounter()
        let delivery = NSEDelivery<Int> { content in received.withLock { $0.append(content) } }

        delivery.deliver(1)
        let second = delivery.deliver(2)

        XCTAssertFalse(second)
        XCTAssertEqual(received.withLock { $0 }, [1])
    }

    func test_neverDelivered_reportsIt() {
        let delivery = NSEDelivery<Int> { _ in }

        XCTAssertFalse(delivery.hasDelivered)
    }

    func test_concurrentDelivers_fireExactlyOnce() {
        let received = makeCounter()
        let winners = OSAllocatedUnfairLock(initialState: 0)
        let delivery = NSEDelivery<Int> { content in received.withLock { $0.append(content) } }

        DispatchQueue.concurrentPerform(iterations: 200) { index in
            if delivery.deliver(index) { winners.withLock { $0 += 1 } }
        }

        XCTAssertEqual(received.withLock { $0.count }, 1)
        XCTAssertEqual(winners.withLock { $0 }, 1)
    }
}
