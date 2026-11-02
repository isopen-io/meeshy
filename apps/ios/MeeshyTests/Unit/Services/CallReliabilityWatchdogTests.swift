import XCTest
@testable import Meeshy

/// The reliability monitor's clocks (#11522): what the watchdog decides for
/// each tick, with the exact budgets of `CallReliabilityPolicy`.
final class CallReliabilityWatchdogTests: XCTestCase {

    private let start = Date(timeIntervalSince1970: 1_000)
    private let failBudget = QualityThresholds.connectingFailSeconds

    private func at(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }

    // MARK: - .connecting

    func test_connecting_firstTick_startsTheClockAndWaits() {
        var watchdog = CallReliabilityWatchdog()
        XCTAssertEqual(watchdog.connecting(now: start, failAfterSeconds: failBudget, awaitingRemoteOffer: false), .waiting)
        XCTAssertEqual(watchdog.connectingSince, start)
    }

    func test_connecting_pastTheRestartBudget_restartsIceOnce() {
        var watchdog = CallReliabilityWatchdog()
        _ = watchdog.connecting(now: start, failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        let restartAt = QualityThresholds.connectingRestartSeconds
        XCTAssertEqual(watchdog.connecting(now: at(restartAt), failAfterSeconds: failBudget, awaitingRemoteOffer: false),
                       .restartICE(elapsed: restartAt))
        XCTAssertTrue(watchdog.didAttemptConnectingRestart)
        XCTAssertEqual(watchdog.connecting(now: at(restartAt + 1), failAfterSeconds: failBudget, awaitingRemoteOffer: false),
                       .waiting)
    }

    func test_connecting_pastTheFailBudget_fails() {
        var watchdog = CallReliabilityWatchdog()
        _ = watchdog.connecting(now: start, failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        XCTAssertEqual(watchdog.connecting(now: at(failBudget), failAfterSeconds: failBudget, awaitingRemoteOffer: false),
                       .fail(elapsed: failBudget))
    }

    func test_connecting_whileTheOfferIsAwaited_restartsItsClock() {
        var watchdog = CallReliabilityWatchdog()
        _ = watchdog.connecting(now: start, failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        XCTAssertEqual(watchdog.connecting(now: at(20), failAfterSeconds: failBudget, awaitingRemoteOffer: true), .waiting)
        XCTAssertNil(watchdog.connectingSince)
        XCTAssertEqual(watchdog.connecting(now: at(25), failAfterSeconds: failBudget, awaitingRemoteOffer: false), .waiting,
                       "an offer that arrives at 20 s must not be cut at 25 s")
        XCTAssertEqual(watchdog.connectingSince, at(25))
    }

    func test_connectingCaughtUp_rearmsTheRestart() {
        var watchdog = CallReliabilityWatchdog()
        _ = watchdog.connecting(now: start, failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        _ = watchdog.connecting(now: at(QualityThresholds.connectingRestartSeconds), failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        watchdog.connectingCaughtUp()
        XCTAssertNil(watchdog.connectingSince)
        XCTAssertFalse(watchdog.didAttemptConnectingRestart)
    }

    func test_connecting_clearsTheReconnectingClock() {
        var watchdog = CallReliabilityWatchdog()
        _ = watchdog.reconnecting(attempt: 1, now: start)
        _ = watchdog.connecting(now: at(1), failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        XCTAssertNil(watchdog.reconnectingSince)
        XCTAssertNil(watchdog.reconnectingWatchedAttempt)
    }

    // MARK: - .reconnecting

    func test_reconnecting_pastTheAttemptBudget_stalls() {
        var watchdog = CallReliabilityWatchdog()
        let budget = QualityThresholds.reconnectAttemptBudgetSeconds
        XCTAssertEqual(watchdog.reconnecting(attempt: 1, now: start), .waiting)
        XCTAssertEqual(watchdog.reconnecting(attempt: 1, now: at(budget)), .stalled(elapsed: budget))
    }

    func test_reconnecting_aNewAttempt_restartsTheClock() {
        var watchdog = CallReliabilityWatchdog()
        let budget = QualityThresholds.reconnectAttemptBudgetSeconds
        _ = watchdog.reconnecting(attempt: 1, now: start)
        XCTAssertEqual(watchdog.reconnecting(attempt: 2, now: at(budget)), .waiting)
        XCTAssertEqual(watchdog.reconnectingSince, at(budget))
        XCTAssertEqual(watchdog.reconnectingWatchedAttempt, 2)
    }

    func test_reconnecting_clearsTheConnectingClockAndRestart() {
        var watchdog = CallReliabilityWatchdog()
        _ = watchdog.connecting(now: start, failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        _ = watchdog.connecting(now: at(QualityThresholds.connectingRestartSeconds), failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        _ = watchdog.reconnecting(attempt: 1, now: at(20))
        XCTAssertNil(watchdog.connectingSince)
        XCTAssertFalse(watchdog.didAttemptConnectingRestart)
    }

    func test_reconnectingResolved_rearmsTheAttemptClock() {
        var watchdog = CallReliabilityWatchdog()
        _ = watchdog.reconnecting(attempt: 1, now: start)
        watchdog.reconnectingResolved()
        XCTAssertNil(watchdog.reconnectingSince)
        XCTAssertNil(watchdog.reconnectingWatchedAttempt)
        XCTAssertEqual(watchdog.reconnecting(attempt: 1, now: at(30)), .waiting,
                       "the same attempt re-arms a fresh clock after an escalation")
    }

    // MARK: - Other states

    func test_offeringAndConnected_clearEveryClock() {
        for settle in [{ (w: inout CallReliabilityWatchdog) in w.offering() },
                       { (w: inout CallReliabilityWatchdog) in w.connected() }] {
            var watchdog = CallReliabilityWatchdog()
            _ = watchdog.connecting(now: start, failAfterSeconds: failBudget, awaitingRemoteOffer: false)
            _ = watchdog.connecting(now: at(QualityThresholds.connectingRestartSeconds), failAfterSeconds: failBudget, awaitingRemoteOffer: false)
            settle(&watchdog)
            XCTAssertNil(watchdog.connectingSince)
            XCTAssertFalse(watchdog.didAttemptConnectingRestart)
            XCTAssertNil(watchdog.reconnectingSince)
            XCTAssertNil(watchdog.reconnectingWatchedAttempt)
        }
    }

    func test_otherStates_keepTheSpentRestart() {
        var watchdog = CallReliabilityWatchdog()
        _ = watchdog.connecting(now: start, failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        _ = watchdog.connecting(now: at(QualityThresholds.connectingRestartSeconds), failAfterSeconds: failBudget, awaitingRemoteOffer: false)
        watchdog.otherState()
        XCTAssertNil(watchdog.connectingSince)
        XCTAssertTrue(watchdog.didAttemptConnectingRestart,
                      "ringing/idle/ended only drop the clocks, as the loop always did")
    }
}
