import XCTest
@testable import Meeshy

/// `CallLiveClock` possède le chrono et le battement de cœur (#11522) : démarrer
/// arme la tâche, redémarrer n'en garde qu'une, arrêter la retire.
@MainActor
final class CallLiveClockTests: XCTestCase {

    func test_startingTheHeartbeat_armsIt_andStoppingRemovesIt() {
        let clock = CallLiveClock()

        clock.startHeartbeat()
        XCTAssertTrue(clock.isHeartbeatRunning)

        clock.stopHeartbeat()
        XCTAssertFalse(clock.isHeartbeatRunning)
    }

    func test_startingTheDurationClockTwice_keepsOneTask() {
        let clock = CallLiveClock()

        clock.startDurationClock()
        clock.startDurationClock()
        XCTAssertTrue(clock.isDurationClockRunning)

        clock.stopDurationClock()
        XCTAssertFalse(clock.isDurationClockRunning)
    }

    func test_stoppingWithoutStarting_isANoOp() {
        let clock = CallLiveClock()

        clock.stopHeartbeat()
        clock.stopDurationClock()

        XCTAssertFalse(clock.isHeartbeatRunning)
        XCTAssertFalse(clock.isDurationClockRunning)
    }
}
