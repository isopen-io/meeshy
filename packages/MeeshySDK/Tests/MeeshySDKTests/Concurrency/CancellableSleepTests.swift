import XCTest
@testable import MeeshySDK

final class CancellableSleepTests: XCTestCase {

    func test_returnsTrueAfterFullDuration() async {
        let started = ContinuousClock.now
        let slept = await cancellableSleep(for: .milliseconds(60))
        XCTAssertTrue(slept)
        XCTAssertGreaterThanOrEqual(ContinuousClock.now - started, .milliseconds(55))
    }

    func test_returnsFalseQuicklyWhenCancelledDuringSleep() async {
        let task = Task { await cancellableSleep(for: .seconds(5)) }
        _ = await cancellableSleep(for: .milliseconds(10))
        let started = ContinuousClock.now
        task.cancel()
        let slept = await task.value
        XCTAssertFalse(slept)
        XCTAssertLessThan(ContinuousClock.now - started, .milliseconds(50))
    }

    func test_returnsFalseAtOnceWhenAlreadyCancelled() async {
        let task = Task { () -> Bool in
            while !Task.isCancelled { await Task.yield() }
            return await cancellableSleep(for: .seconds(5))
        }
        task.cancel()
        let slept = await task.value
        XCTAssertFalse(slept)
    }
}
