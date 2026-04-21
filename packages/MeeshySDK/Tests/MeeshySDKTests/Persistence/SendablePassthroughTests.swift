import XCTest
import Combine
@testable import MeeshySDK

final class SendablePassthroughTests: XCTestCase {

    func test_send_deliversValueToSubscriber() {
        let sut = SendablePassthrough<Int>()
        var received: [Int] = []
        let cancellable = sut.sink { received.append($0) }

        sut.send(42)
        sut.send(99)

        XCTAssertEqual(received, [42, 99])
        cancellable.cancel()
    }

    func test_send_deliversToMultipleSubscribers() {
        let sut = SendablePassthrough<String>()
        var received1: [String] = []
        var received2: [String] = []
        let c1 = sut.sink { received1.append($0) }
        let c2 = sut.sink { received2.append($0) }

        sut.send("hello")

        XCTAssertEqual(received1, ["hello"])
        XCTAssertEqual(received2, ["hello"])
        c1.cancel()
        c2.cancel()
    }

    func test_cancel_stopsDelivery() {
        let sut = SendablePassthrough<Int>()
        var received: [Int] = []
        let cancellable = sut.sink { received.append($0) }

        sut.send(1)
        cancellable.cancel()
        sut.send(2)

        XCTAssertEqual(received, [1])
    }

    func test_receiveOn_deliversOnSpecifiedScheduler() {
        let sut = SendablePassthrough<Int>()
        let expectation = expectation(description: "receive on main")
        var receivedOnMain = false

        let cancellable = sut.receive(on: DispatchQueue.main)
            .sink { _ in
                receivedOnMain = Thread.isMainThread
                expectation.fulfill()
            }

        DispatchQueue.global().async {
            sut.send(1)
        }

        wait(for: [expectation], timeout: 2)
        XCTAssertTrue(receivedOnMain)
        cancellable.cancel()
    }

    func test_publisher_erasesToAnyPublisher() {
        let sut = SendablePassthrough<Int>()
        var received: [Int] = []
        let cancellable = sut.publisher.sink { received.append($0) }

        sut.send(10)

        XCTAssertEqual(received, [10])
        cancellable.cancel()
    }

    func test_concurrentSends_doNotCrash() {
        let sut = SendablePassthrough<Int>()
        var received: [Int] = []
        let lock = NSLock()
        let cancellable = sut.sink { value in
            lock.lock()
            received.append(value)
            lock.unlock()
        }

        let group = DispatchGroup()
        for i in 0..<100 {
            group.enter()
            DispatchQueue.global().async {
                sut.send(i)
                group.leave()
            }
        }

        group.wait()
        lock.lock()
        XCTAssertEqual(received.count, 100)
        lock.unlock()
        cancellable.cancel()
    }
}
