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

    // MARK: - #20010 — la durée se lit sur une horloge MONOTONE injectée

    func test_elapsedDuration_followsTheMonotonicClock_notTheWallClock() {
        let (clock, uptime) = makeSUT(startingAt: 5_000)

        clock.anchorDuration()
        uptime.seconds += 125

        XCTAssertEqual(clock.elapsedDuration, 125)
    }

    func test_anchorDuration_returnsTheMonotonicInstantItAnchors() {
        let (clock, uptime) = makeSUT(startingAt: 7_200)

        XCTAssertEqual(clock.anchorDuration(), 7_200)
        XCTAssertEqual(clock.monotonicNow, 7_200)
        uptime.seconds += 3
        XCTAssertEqual(clock.monotonicNow, 7_203)
    }

    func test_elapsedDuration_withoutAnchor_isNil_andStoppingForgetsIt() {
        let (clock, uptime) = makeSUT(startingAt: 10)

        XCTAssertNil(clock.elapsedDuration)
        clock.anchorDuration()
        clock.startDurationClock()
        uptime.seconds += 60
        clock.stopDurationClock()

        XCTAssertNil(clock.elapsedDuration)
    }

    func test_reanchoring_restartsTheDurationAtZero() {
        let (clock, uptime) = makeSUT(startingAt: 100)

        clock.anchorDuration()
        uptime.seconds += 90
        clock.anchorDuration()
        uptime.seconds += 4

        XCTAssertEqual(clock.elapsedDuration, 4)
    }

    /// Le câblage : le chrono, son ancre et les délais du rapport lisent
    /// l'horloge monotone. Remettre `Date().timeIntervalSince(start)` dans la
    /// boucle, ou ancrer la mesure sur `callStartDate`, fait rougir ce témoin.
    func test_wiring_durationAndSetupDelays_readTheMonotonicClock() throws {
        let liveClock = try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallCollaborators/CallLiveClock.swift")
        let call = try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallManager.swift")

        XCTAssertFalse(liveClock.contains("Date()"), "CallLiveClock must never read the wall clock")
        XCTAssertTrue(liveClock.contains("guard let elapsed = self.elapsedDuration else { continue }"))
        XCTAssertTrue(liveClock.contains("call.callDuration = elapsed"))
        XCTAssertFalse(call.contains("timeIntervalSince(callStartDate"))
        XCTAssertTrue(call.contains("analytics.connectedUptime = liveClock.anchorDuration()"))
        XCTAssertEqual(call.components(separatedBy: "analytics.callInitiatedUptime = call.liveClock.monotonicNow").count - 1, 3)
        XCTAssertGreaterThanOrEqual(call.components(separatedBy: "analytics.negotiationStartUptime = ").count - 1, 3)
    }

    private func makeSUT(startingAt seconds: TimeInterval) -> (CallLiveClock, FakeUptime) {
        let uptime = FakeUptime(seconds: seconds)
        return (CallLiveClock(monotonicSeconds: { uptime.seconds }), uptime)
    }
}

/// Horloge monotone simulée : seul le test la fait avancer, l'horloge murale
/// du poste n'intervient jamais.
@MainActor
private final class FakeUptime {
    var seconds: TimeInterval

    init(seconds: TimeInterval) {
        self.seconds = seconds
    }
}
