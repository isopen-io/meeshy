import XCTest
@testable import Meeshy

/// `CallLiveClock` possède le chrono et le battement de cœur (#11522) : démarrer
/// arme la tâche, redémarrer n'en garde qu'une, arrêter la retire. Le chrono
/// lit l'horloge MONOTONE injectée, jamais `Date` (#20010).
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

    // MARK: - #20010 — le chrono lit l'horloge monotone injectée

    private nonisolated struct FixedMonotonicClock: CallMonotonicClockProviding {
        let now: ContinuousClock.Instant
    }

    private static func makeClock(elapsed: Duration, since start: ContinuousClock.Instant) -> CallLiveClock {
        CallLiveClock(monotonicClock: FixedMonotonicClock(now: start.advanced(by: elapsed)))
    }

    func test_elapsedSeconds_injectedClock125sAfterStart_reads125() {
        let start = ContinuousClock.now.advanced(by: .seconds(-10_000))
        let clock = Self.makeClock(elapsed: .seconds(125), since: start)

        XCTAssertEqual(clock.elapsedSeconds(since: start), 125, accuracy: 0.000_001)
    }

    func test_monotonicNow_isTheInjectedClock() {
        let instant = ContinuousClock.now.advanced(by: .seconds(-10_000))
        let clock = CallLiveClock(monotonicClock: FixedMonotonicClock(now: instant))

        XCTAssertEqual(clock.monotonicNow, instant)
    }

    func test_markCallStart_anchorsOnTheInjectedClock_andStopClearsIt() {
        let instant = ContinuousClock.now.advanced(by: .seconds(-10_000))
        let clock = CallLiveClock(monotonicClock: FixedMonotonicClock(now: instant))

        XCTAssertEqual(clock.markCallStart(), instant)
        XCTAssertEqual(clock.callStartInstant, instant)

        clock.stopDurationClock()
        XCTAssertNil(clock.callStartInstant)
    }

    func test_durationLoop_source_readsOwnMonotonicAnchorThroughInjectedClock() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallCollaborators/CallLiveClock.swift")

        XCTAssertTrue(source.contains("guard let start = self.callStartInstant else { continue }"))
        XCTAssertTrue(source.contains("call.callDuration = self.elapsedSeconds(since: start)"))
        XCTAssertTrue(source.contains("CallReliabilityPolicy.elapsedSeconds(since: start, now: monotonicClock.now)"))
        XCTAssertFalse(source.contains("Date()"))
        XCTAssertFalse(source.contains("ContinuousClock.now"))
    }

    func test_callUnit_source_stampsEveryMonotonicAnchorBesideItsDate() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallManager.swift")
        let count = { (needle: String) in source.components(separatedBy: needle).count - 1 }

        XCTAssertEqual(count("analytics.stampConnected(wall: callStartDate, monotonic: liveClock.markCallStart())"), 1)
        XCTAssertEqual(count("analytics.stampNegotiationStart(wall: Date(), monotonic: liveClock.monotonicNow)"), 2)
        XCTAssertEqual(count("analytics.stampNegotiationStart(wall: Date(), monotonic: self.liveClock.monotonicNow)"), 1)
        XCTAssertEqual(count("analytics.stampInitiated(wall: Date(), monotonic: call.liveClock.monotonicNow)"), 3)
        XCTAssertEqual(count("analytics.callInitiatedDate = "), 0)
        XCTAssertEqual(count("analytics.negotiationStartDate = "), 0)
        XCTAssertEqual(count("analytics.connectedDate = "), 0)
    }
}
