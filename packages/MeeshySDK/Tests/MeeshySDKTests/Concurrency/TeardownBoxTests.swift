import XCTest
@testable import MeeshySDK

final class TeardownBoxTests: XCTestCase {

    private struct Resources {
        var generation = 0
    }

    func test_releaseNow_passesLatestResourcesExactlyOnce() {
        let box = TeardownBox(Resources())
        box.update { $0.generation = 1 }
        box.update { $0.generation = 2 }
        var received: [Int] = []
        box.releaseNow { received.append($0.generation) }
        box.releaseNow { received.append($0.generation) }
        XCTAssertEqual(received, [2])
    }

    func test_updateAfterRelease_isIgnoredAndReadKeepsLastState() {
        let box = TeardownBox(Resources(generation: 7))
        box.releaseNow { _ in }
        box.update { $0.generation = 99 }
        XCTAssertEqual(box.read { $0.generation }, 7)
    }

    func test_releaseOnQueue_runsOnThatQueueExactlyOnce() {
        let key = DispatchSpecificKey<Bool>()
        let queue = DispatchQueue(label: "teardown-box-test")
        queue.setSpecific(key: key, value: true)
        let box = TeardownBox(Resources(generation: 3))
        let calls = Locked([Bool]())
        let done = expectation(description: "released")
        done.expectedFulfillmentCount = 1
        let body: @Sendable (Resources) -> Void = { _ in
            calls.mutate { $0.append(DispatchQueue.getSpecific(key: key) == true) }
            done.fulfill()
        }
        box.release(on: queue, body)
        box.release(on: queue, body)
        wait(for: [done], timeout: 2)
        queue.sync {}
        XCTAssertEqual(calls.read { $0 }, [true])
    }
}
