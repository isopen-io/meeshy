//
//  VideoSurvivalControllerTests.swift
//  MeeshyTests
//
//  Covers the graceful audio-only survival layer: the pure time-based policy
//  and the controller that drives it. Special attention to ULTRA-LONG-CALL
//  robustness (tens to hundreds of hours): monotonic-clock timing, O(1) state,
//  and stability across tens of thousands of samples.
//

import XCTest
@testable import Meeshy

// MARK: - Policy (pure)

@MainActor
final class VideoSurvivalPolicyTests: XCTestCase {
    private func makePolicy() -> VideoSurvivalPolicy {
        VideoSurvivalPolicy(suspendAfter: 6, resumeAfter: 10)
    }

    /// Drive [level, monotonic-time] samples through the policy, collecting actions.
    private func run(
        _ samples: [(VideoQualityLevel, TimeInterval)],
        userWantsVideo: Bool = true,
        from initial: VideoSurvivalState = .initial,
        policy: VideoSurvivalPolicy? = nil
    ) -> (state: VideoSurvivalState, actions: [VideoSurvivalAction]) {
        let p = policy ?? makePolicy()
        var state = initial
        var actions: [VideoSurvivalAction] = []
        for (level, t) in samples {
            let r = p.reduce(state, level: level, at: t, userWantsVideo: userWantsVideo)
            state = r.state
            actions.append(r.action)
        }
        return (state, actions)
    }

    func test_reduce_firstPoor_doesNotSuspend_butStartsStreak() {
        let (state, actions) = run([(.poor, 1000)])
        XCTAssertEqual(actions, [.none])
        XCTAssertTrue(state.isSending)
        XCTAssertEqual(state.degradedSince, 1000)
    }

    func test_reduce_sustainedPoor_suspendsAfterDuration() {
        let (state, actions) = run([(.poor, 0), (.poor, 5), (.poor, 6)])
        XCTAssertEqual(actions.last, .suspend)
        XCTAssertFalse(state.isSending)
    }

    func test_reduce_critical_isTreatedAsDegraded() {
        let (state, actions) = run([(.critical, 0), (.critical, 6)])
        XCTAssertEqual(actions.last, .suspend)
        XCTAssertFalse(state.isSending)
    }

    func test_reduce_isIntervalAgnostic_slowCadenceStillSuspends() {
        // 4s cadence: t=0,4,8. Suspends at the first sample >= 6s elapsed (t=8),
        // NOT after a fixed sample count.
        let (_, actions) = run([(.poor, 0), (.poor, 4), (.poor, 8)])
        XCTAssertEqual(actions, [.none, .none, .suspend])
    }

    func test_reduce_briefPoorBrokenByFair_doesNotSuspend() {
        let (state, actions) = run([(.poor, 0), (.poor, 4), (.fair, 5), (.poor, 9), (.poor, 12)])
        XCTAssertFalse(actions.contains(.suspend))
        XCTAssertTrue(state.isSending)
    }

    func test_reduce_suspended_sustainedGood_resumesAfterDuration() {
        let suspended = run([(.poor, 0), (.poor, 6)]).state
        XCTAssertFalse(suspended.isSending)
        let (state, actions) = run([(.good, 0), (.good, 9), (.good, 10)], from: suspended)
        XCTAssertEqual(actions.last, .resume)
        XCTAssertTrue(state.isSending)
    }

    func test_reduce_suspended_notLongEnoughGood_staysSuspended() {
        let suspended = run([(.poor, 0), (.poor, 6)]).state
        let (state, actions) = run([(.good, 100), (.good, 105)], from: suspended)
        XCTAssertFalse(actions.contains(.resume))
        XCTAssertFalse(state.isSending)
    }

    func test_reduce_suspended_poorResetsRecoveryTimer() {
        let suspended = run([(.poor, 0), (.poor, 6)]).state
        let (state, actions) = run(
            [(.good, 0), (.good, 8), (.poor, 9), (.good, 11), (.good, 18)],
            from: suspended
        )
        XCTAssertFalse(actions.contains(.resume))
        XCTAssertFalse(state.isSending)
    }

    func test_reduce_suspended_fairHoldsRecoveryTimer() {
        let suspended = run([(.poor, 0), (.poor, 6)]).state
        // good@0, fair@9 (holds), good@10 → elapsed since 0 >= 10 → resume.
        let (_, actions) = run([(.good, 0), (.fair, 9), (.good, 10)], from: suspended)
        XCTAssertTrue(actions.contains(.resume))
    }

    func test_reduce_userDoesNotWantVideo_idleAndReset() {
        let (state, actions) = run([(.poor, 0), (.poor, 6), (.good, 20)], userWantsVideo: false)
        XCTAssertTrue(actions.allSatisfy { $0 == .none })
        XCTAssertEqual(state, .initial)
    }

    // MARK: Ultra-long-call robustness

    func test_reduce_isStableAcrossHundredsOfHoursOfSamples() {
        // Simulate ~100h of "good" at a 5s cadence (72k samples). State must stay
        // O(1) and the policy must remain correct (no suspend on a healthy link).
        let p = makePolicy()
        var state = VideoSurvivalState.initial
        var t: TimeInterval = 0
        for _ in 0..<72_000 {
            let r = p.reduce(state, level: .good, at: t, userWantsVideo: true)
            XCTAssertEqual(r.action, .none)
            state = r.state
            t += 5
        }
        XCTAssertTrue(state.isSending)
        XCTAssertNil(state.degradedSince)
        XCTAssertNil(state.recoveringSince)
    }

    func test_reduce_worksWithLargeMonotonicTimestamps() {
        // Timestamps near 100h of uptime (360000s) must behave identically — no
        // precision loss, no overflow.
        let base: TimeInterval = 360_000
        let (state, actions) = run([(.poor, base), (.poor, base + 6)])
        XCTAssertEqual(actions.last, .suspend)
        XCTAssertFalse(state.isSending)
    }
}

// MARK: - Mock

@MainActor
final class MockVideoSurvivalActuator: VideoSurvivalActuating {
    var suspendResult = true
    var resumeResult = true
    /// When set, the actuator "hangs" this long before returning — simulates a
    /// renegotiation stuck on a dead link (exercises the controller's timeout).
    var hangSeconds: TimeInterval = 0
    private(set) var suspendCallCount = 0
    private(set) var resumeCallCount = 0
    var onTransition: (() -> Void)?

    func suspendOutboundVideo() async -> Bool {
        suspendCallCount += 1
        onTransition?()
        if hangSeconds > 0 { try? await Task.sleep(nanoseconds: UInt64(hangSeconds * 1_000_000_000)) }
        return suspendResult
    }
    func resumeOutboundVideo() async -> Bool {
        resumeCallCount += 1
        onTransition?()
        if hangSeconds > 0 { try? await Task.sleep(nanoseconds: UInt64(hangSeconds * 1_000_000_000)) }
        return resumeResult
    }
    func reset() {
        suspendCallCount = 0
        resumeCallCount = 0
        onTransition = nil
    }
}

// MARK: - Controller

@MainActor
final class VideoSurvivalControllerTests: XCTestCase {
    private func makeSUT(
        suspendAfter: TimeInterval = 6,
        resumeAfter: TimeInterval = 10,
        transitionTimeout: TimeInterval = 20
    ) -> (sut: VideoSurvivalController, mock: MockVideoSurvivalActuator, advance: (TimeInterval) -> Void) {
        let mock = MockVideoSurvivalActuator()
        var clock: TimeInterval = 0
        let sut = VideoSurvivalController(
            actuator: mock,
            policy: VideoSurvivalPolicy(suspendAfter: suspendAfter, resumeAfter: resumeAfter),
            now: { clock },
            transitionTimeout: transitionTimeout
        )
        return (sut, mock, { clock += $0 })
    }

    private func feed(_ sut: VideoSurvivalController, _ level: VideoQualityLevel, wants: Bool = true) {
        sut.handle(level: level, userWantsVideo: wants)
    }

    /// `onTransition` se déclenche au DÉBUT de l'appel actuator, mais
    /// `isVideoSuspended` n'est posé qu'après le task group — on poll
    /// jusqu'à l'état attendu au lieu d'asserter immédiatement (flaky CI).
    private func waitForSuspendedState(
        _ expected: Bool,
        in sut: VideoSurvivalController,
        timeout: TimeInterval = 5.0
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if sut.isVideoSuspended == expected { return }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("isVideoSuspended did not become \(expected) within \(timeout)s")
    }

    func test_handle_sustainedPoor_callsSuspendAndPublishes() async {
        let (sut, mock, advance) = makeSUT()
        let exp = expectation(description: "suspend")
        mock.onTransition = { exp.fulfill() }

        feed(sut, .poor)            // t=0 start streak
        advance(6)
        feed(sut, .poor)            // t=6 → suspend

        await fulfillment(of: [exp], timeout: 1)
        XCTAssertEqual(mock.suspendCallCount, 1)
        await waitForSuspendedState(true, in: sut)
    }

    func test_handle_suspendFailure_revertsForRetry() async {
        let (sut, mock, advance) = makeSUT()
        mock.suspendResult = false
        let exp = expectation(description: "suspend attempt")
        mock.onTransition = { exp.fulfill() }

        feed(sut, .poor)
        advance(6)
        feed(sut, .poor)            // → suspend attempt (fails)

        await fulfillment(of: [exp], timeout: 1)
        XCTAssertEqual(mock.suspendCallCount, 1)
        XCTAssertFalse(sut.isVideoSuspended) // stayed sending after failure
    }

    func test_handle_sustainedGoodAfterSuspend_callsResume() async {
        let (sut, mock, advance) = makeSUT()
        let suspendExp = expectation(description: "suspend")
        mock.onTransition = { suspendExp.fulfill() }
        feed(sut, .poor); advance(6); feed(sut, .poor)
        await fulfillment(of: [suspendExp], timeout: 1)
        await waitForSuspendedState(true, in: sut)

        let resumeExp = expectation(description: "resume")
        mock.onTransition = { resumeExp.fulfill() }
        feed(sut, .good)            // start recovery streak
        advance(10)
        feed(sut, .good)            // → resume
        await fulfillment(of: [resumeExp], timeout: 1)
        XCTAssertEqual(mock.resumeCallCount, 1)
        await waitForSuspendedState(false, in: sut)
    }

    func test_handle_userTurnsVideoOff_doesNotSuspend() async {
        let (sut, _, advance) = makeSUT()
        feed(sut, .poor, wants: false)
        advance(20)
        feed(sut, .poor, wants: false)
        // Give any stray Task a chance — there should be none.
        await Task.yield()
        XCTAssertFalse(sut.isVideoSuspended)
    }

    func test_reset_clearsSuspendedState() async {
        let (sut, mock, advance) = makeSUT()
        let exp = expectation(description: "suspend")
        mock.onTransition = { exp.fulfill() }
        feed(sut, .poor); advance(6); feed(sut, .poor)
        await fulfillment(of: [exp], timeout: 1)
        await waitForSuspendedState(true, in: sut)

        sut.reset()
        XCTAssertFalse(sut.isVideoSuspended)
    }

    func test_handle_hungTransition_timesOutWithoutFreezing() async {
        // A renegotiation that hangs must NOT pin the controller in the
        // transitioning state for the rest of the call.
        let (sut, mock, advance) = makeSUT(transitionTimeout: 0.05)
        mock.hangSeconds = 10 // far longer than the 50ms timeout

        let attempt = expectation(description: "suspend attempt")
        mock.onTransition = { attempt.fulfill() }
        feed(sut, .poor); advance(6); feed(sut, .poor) // trigger suspend
        await fulfillment(of: [attempt], timeout: 1)

        // After the timeout fires, the controller reverts (not suspended) and is
        // free to act again — prove it by landing a second suspend on a fresh
        // sustained streak.
        mock.hangSeconds = 0
        let retry = expectation(description: "retry suspend after timeout")
        mock.onTransition = { retry.fulfill() }
        // Re-feed until the controller is no longer transitioning (timeout cleared it).
        for _ in 0..<40 {
            advance(6)
            feed(sut, .poor)
            if mock.suspendCallCount >= 2 { break }
            try? await Task.sleep(nanoseconds: 20_000_000) // 20ms, > the 50ms? loop budget covers it
        }
        await fulfillment(of: [retry], timeout: 1)
        XCTAssertGreaterThanOrEqual(mock.suspendCallCount, 2)
        XCTAssertTrue(sut.isVideoSuspended)
    }
}
