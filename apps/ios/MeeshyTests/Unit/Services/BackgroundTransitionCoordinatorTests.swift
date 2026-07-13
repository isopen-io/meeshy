import XCTest
@testable import Meeshy

/// `runBounded` is the timeout that keeps the non-critical, durable engagement
/// flush from holding the background-task budget hostage (0x8BADF00D watchdog).
final class BackgroundTransitionCoordinatorTests: XCTestCase {

    func test_runBounded_slowOperation_returnsAtBudgetNotOperationDuration() async {
        let start = Date()
        let completed = await BackgroundTransitionCoordinator.runBounded(seconds: 0.1) {
            try? await Task.sleep(nanoseconds: 3_000_000_000)   // 3s of "network"
        }
        let elapsed = Date().timeIntervalSince(start)

        XCTAssertFalse(completed, "a slow operation must report as timed-out, not completed")
        XCTAssertLessThan(elapsed, 1.5, "must return near the 0.1s bound, never the 3s operation")
    }

    func test_runBounded_fastOperation_reportsCompleted() async {
        let completed = await BackgroundTransitionCoordinator.runBounded(seconds: 5.0) { }
        XCTAssertTrue(completed, "an operation that finishes inside the bound reports completed")
    }
}
