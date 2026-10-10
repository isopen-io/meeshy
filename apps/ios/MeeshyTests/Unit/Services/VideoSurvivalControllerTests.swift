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
    /// How an actuator call holds before returning. Never measured in time: a
    /// held call returns only when the TEST releases it (#9513), so a slow
    /// runner can neither make it return early nor late.
    enum Hold {
        /// Returns immediately.
        case none
        /// Parks until `releaseHeldCalls()`, IGNORING Task cancellation — a
        /// real `AVCaptureSession`/WebRTC call that doesn't observe Swift's
        /// cooperative cancellation (exercises "abandon on timeout").
        case untilReleased
        /// Parks until `releaseHeldCalls()` OR until its Task is cancelled — a
        /// cancellation-aware renegotiation (exercises "reset() cancels it").
        case untilReleasedOrCancelled
    }

    var suspendResult = true
    var resumeResult = true
    var hold: Hold = .none
    private(set) var suspendCallCount = 0
    private(set) var resumeCallCount = 0
    var onTransition: (() -> Void)?
    /// Fired when a held call stops holding (released or cancelled), just
    /// before the actuator returns.
    var onHangComplete: (() -> Void)?
    private var heldCalls: [Int: CheckedContinuation<Void, Never>] = [:]
    private var lastHeldCallID = 0

    func suspendOutboundVideo() async -> Bool {
        suspendCallCount += 1
        onTransition?()
        await holdIfRequested()
        return suspendResult
    }
    func resumeOutboundVideo() async -> Bool {
        resumeCallCount += 1
        onTransition?()
        await holdIfRequested()
        return resumeResult
    }

    private func holdIfRequested() async {
        switch hold {
        case .none:
            return
        case .untilReleased:
            await park(id: allocateHeldCallID(), unlessCancelled: false)
        case .untilReleasedOrCancelled:
            let id = allocateHeldCallID()
            await withTaskCancellationHandler {
                await park(id: id, unlessCancelled: true)
            } onCancel: {
                Task { @MainActor [weak self] in self?.release(id) }
            }
        }
        onHangComplete?()
    }

    private func allocateHeldCallID() -> Int {
        lastHeldCallID += 1
        return lastHeldCallID
    }

    private func park(id: Int, unlessCancelled: Bool) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            if unlessCancelled && Task.isCancelled {
                continuation.resume()
                return
            }
            heldCalls[id] = continuation
        }
    }

    private func release(_ id: Int) {
        heldCalls.removeValue(forKey: id)?.resume()
    }

    /// Releases every parked call. A test that holds a call MUST release it
    /// before finishing — an un-resumed `CheckedContinuation` triggers a
    /// runtime "leaked its continuation" diagnostic.
    func releaseHeldCalls() {
        let parked = heldCalls
        heldCalls = [:]
        parked.values.forEach { $0.resume() }
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
    /// `isVideoSuspended` n'est posé qu'une fois la complétion traitée : on
    /// attend `onTransitionSettled`, jamais l'horloge murale (#9513).
    private func expectSettle(of sut: VideoSurvivalController, _ description: String) -> XCTestExpectation {
        let settled = expectation(description: description)
        sut.onTransitionSettled = { settled.fulfill() }
        return settled
    }

    func test_handle_sustainedPoor_callsSuspendAndPublishes() async {
        let (sut, mock, advance) = makeSUT()
        let exp = expectation(description: "suspend")
        mock.onTransition = { exp.fulfill() }
        let settled = expectSettle(of: sut, "suspend settled")

        feed(sut, .poor)            // t=0 start streak
        advance(6)
        feed(sut, .poor)            // t=6 → suspend

        await fulfillment(of: [exp, settled], timeout: 5, enforceOrder: true)
        XCTAssertEqual(mock.suspendCallCount, 1)
        XCTAssertTrue(sut.isVideoSuspended)
    }

    func test_handle_suspendFailure_revertsForRetry() async {
        let (sut, mock, advance) = makeSUT()
        mock.suspendResult = false
        let exp = expectation(description: "suspend attempt")
        mock.onTransition = { exp.fulfill() }
        let settled = expectSettle(of: sut, "failed suspend settled")

        feed(sut, .poor)
        advance(6)
        feed(sut, .poor)            // → suspend attempt (fails)

        await fulfillment(of: [exp, settled], timeout: 5, enforceOrder: true)
        XCTAssertEqual(mock.suspendCallCount, 1)
        XCTAssertFalse(sut.isVideoSuspended) // stayed sending after failure
    }

    func test_handle_sustainedGoodAfterSuspend_callsResume() async {
        let (sut, mock, advance) = makeSUT()
        let suspendExp = expectation(description: "suspend")
        mock.onTransition = { suspendExp.fulfill() }
        let suspendSettled = expectSettle(of: sut, "suspend settled")
        feed(sut, .poor); advance(6); feed(sut, .poor)
        await fulfillment(of: [suspendExp, suspendSettled], timeout: 5, enforceOrder: true)
        XCTAssertTrue(sut.isVideoSuspended)

        let resumeExp = expectation(description: "resume")
        mock.onTransition = { resumeExp.fulfill() }
        let resumeSettled = expectSettle(of: sut, "resume settled")
        feed(sut, .good)            // start recovery streak
        advance(10)
        feed(sut, .good)            // → resume
        await fulfillment(of: [resumeExp, resumeSettled], timeout: 5, enforceOrder: true)
        XCTAssertEqual(mock.resumeCallCount, 1)
        XCTAssertFalse(sut.isVideoSuspended)
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
        let settled = expectSettle(of: sut, "suspend settled")
        feed(sut, .poor); advance(6); feed(sut, .poor)
        await fulfillment(of: [exp, settled], timeout: 5, enforceOrder: true)
        XCTAssertTrue(sut.isVideoSuspended)

        sut.reset()
        XCTAssertFalse(sut.isVideoSuspended)
    }

    func test_handle_hungTransition_timesOutWithoutFreezing() async {
        // A renegotiation that hangs must NOT pin the controller in the
        // transitioning state for the rest of the call.
        // The actuator is held — it only returns when this test releases it,
        // which it does AFTER the verdict. Only the controller's own 50ms
        // timeout can settle the first transition.
        let (sut, mock, advance) = makeSUT(transitionTimeout: 0.05)
        mock.hold = .untilReleasedOrCancelled

        let attempt = expectation(description: "suspend attempt")
        mock.onTransition = { attempt.fulfill() }
        let timedOut = expectation(description: "first transition settled by the timeout")
        sut.onTransitionSettled = { timedOut.fulfill() }
        feed(sut, .poor); advance(6); feed(sut, .poor) // trigger suspend
        await fulfillment(of: [attempt, timedOut], timeout: 5)
        XCTAssertFalse(sut.isVideoSuspended, "a timed-out suspend must revert, not publish")

        // The controller is free to act again — a fresh sustained streak lands
        // a second suspend, which this time returns at once.
        mock.hold = .none
        let retry = expectation(description: "retry suspend after timeout")
        mock.onTransition = { retry.fulfill() }
        let retrySettled = expectation(description: "retry settled")
        sut.onTransitionSettled = { retrySettled.fulfill() }
        feed(sut, .poor); advance(6); feed(sut, .poor)
        await fulfillment(of: [retry, retrySettled], timeout: 5, enforceOrder: true)
        XCTAssertEqual(mock.suspendCallCount, 2)
        XCTAssertTrue(sut.isVideoSuspended)

        sut.onTransitionSettled = nil
        mock.releaseHeldCalls()
    }

    /// Regression guard for the "abandon on timeout" contract. The hold used by
    /// `test_handle_hungTransition_timesOutWithoutFreezing` above is
    /// cancellation-aware, so it can't tell apart a real hard cap from a
    /// timeout that merely REQUESTS cancellation and then waits for the
    /// actuator anyway (Swift's `withTaskGroup` does exactly the latter: it
    /// implicitly awaits every child task before returning, and cancellation is
    /// only cooperative). Real production hangs — `AVCaptureSession`
    /// start/stop, WebRTC `createOffer` — do not observe cooperative
    /// cancellation the way `Task.sleep` does. This mock reproduces THAT: it
    /// blocks on a continuation nothing but the test can resume.
    func test_handle_uncooperativeHang_abandonsWaitAtTimeoutAndUnblocksRetry() async {
        let (sut, mock, advance) = makeSUT(transitionTimeout: 0.05)
        mock.hold = .untilReleased

        let attempt = expectation(description: "suspend attempt")
        mock.onTransition = { attempt.fulfill() }
        let timedOut = expectation(description: "first transition settled by the timeout")
        sut.onTransitionSettled = { timedOut.fulfill() }
        feed(sut, .poor); advance(6); feed(sut, .poor) // trigger suspend

        // The stuck actuator call is NEVER released before the verdict. If the
        // controller's timeout still (bug) waited for it via `withTaskGroup`'s
        // implicit "await all children", the transition could never settle —
        // proving the controller genuinely abandons the wait, rather than
        // merely requesting cancellation and hoping.
        await fulfillment(of: [attempt, timedOut], timeout: 5)
        XCTAssertFalse(sut.isVideoSuspended, "a timed-out suspend must revert, not publish")

        let retry = expectation(description: "retry suspend after timeout abandons the uncooperative hang")
        mock.onTransition = { retry.fulfill() }
        let retrySettled = expectation(description: "retry settled")
        sut.onTransitionSettled = { retrySettled.fulfill() }
        mock.hold = .none // the RETRY call must succeed normally
        feed(sut, .poor); advance(6); feed(sut, .poor)
        await fulfillment(of: [retry, retrySettled], timeout: 5, enforceOrder: true)
        XCTAssertEqual(mock.suspendCallCount, 2)
        XCTAssertTrue(sut.isVideoSuspended)

        // Cleanup: release the first call's still-parked continuation so it
        // doesn't leak past the test (harmless no-op — the race already
        // resolved via timeout).
        sut.onTransitionSettled = nil
        mock.releaseHeldCalls()
    }
}

// MARK: - Concurrency scenarios (generation guard + isTransitioning guard)

/// Exercises the two synchronisation invariants of `VideoSurvivalController`:
///
/// 1. **Generation guard** (`performTransition`): a `reset()` called while a
///    suspend/resume is in-flight must prevent the stale completion from writing
///    `isVideoSuspended` after the controller has already been reset.
///
/// 2. **isTransitioning guard** (`handle`): quality samples arriving while a
///    transition is in-flight are silently dropped; the controller must not start
///    a concurrent second transition (SDP glare risk).
@MainActor
final class VideoSurvivalControllerConcurrencyTests: XCTestCase {

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

    // MARK: Generation guard

    func test_resetMidSuspend_suppressesStaleCompletion() async {
        // The actuator is HELD: it cannot return before this test releases it,
        // so the suspend is in flight at reset() by construction, not by timing.
        let (sut, mock, advance) = makeSUT()
        mock.hold = .untilReleased

        let startedExp = expectation(description: "suspend started")
        mock.onTransition = { startedExp.fulfill() }
        sut.handle(level: .poor, userWantsVideo: true)
        advance(6)
        sut.handle(level: .poor, userWantsVideo: true) // triggers suspend

        await fulfillment(of: [startedExp], timeout: 5)
        XCTAssertFalse(sut.isVideoSuspended, "must not be suspended while actuator is still in-flight")

        // User toggles camera off — reset() increments the generation token.
        sut.reset()
        XCTAssertFalse(sut.isVideoSuspended, "reset() must clear state synchronously")

        // Only now does the stale actuator return `true`. Wait for the controller
        // to have PROCESSED that completion — the generation guard must swallow it.
        let staleSettled = expectation(description: "stale suspend completion processed")
        sut.onTransitionSettled = { staleSettled.fulfill() }
        mock.releaseHeldCalls()
        await fulfillment(of: [staleSettled], timeout: 5)

        XCTAssertFalse(
            sut.isVideoSuspended,
            "stale suspend completion must NOT override reset() — generation mismatch must protect against phantom suspended state"
        )
        XCTAssertEqual(mock.suspendCallCount, 1, "actuator must have been called exactly once")
    }

    func test_resetMidResume_suppressesStaleCompletion() async {
        // Mirror of the above but for the resume path.
        let (sut, mock, advance) = makeSUT()

        // Reach suspended state first (immediate actuator).
        let suspendExp = expectation(description: "suspend")
        mock.onTransition = { suspendExp.fulfill() }
        let suspendSettled = expectation(description: "suspend settled")
        sut.onTransitionSettled = { suspendSettled.fulfill() }
        sut.handle(level: .poor, userWantsVideo: true)
        advance(6)
        sut.handle(level: .poor, userWantsVideo: true)
        await fulfillment(of: [suspendExp, suspendSettled], timeout: 5, enforceOrder: true)
        XCTAssertTrue(sut.isVideoSuspended)

        // Now start a held resume that will FAIL once released. A failed resume
        // that slipped past the generation guard would put the policy back in
        // "suspended" (`isSending = false`) behind reset()'s back — invisible on
        // `isVideoSuspended`, visible on the next degraded streak, which would
        // then never suspend.
        mock.hold = .untilReleased
        mock.resumeResult = false
        let resumeStartedExp = expectation(description: "resume started")
        mock.onTransition = { resumeStartedExp.fulfill() }
        sut.onTransitionSettled = nil
        sut.handle(level: .good, userWantsVideo: true)
        advance(10)
        sut.handle(level: .good, userWantsVideo: true) // triggers resume
        await fulfillment(of: [resumeStartedExp], timeout: 5)

        // Reset while resume is in-flight — generation increments.
        sut.reset()
        XCTAssertFalse(sut.isVideoSuspended, "reset() must clear state synchronously")

        let staleSettled = expectation(description: "stale resume completion processed")
        sut.onTransitionSettled = { staleSettled.fulfill() }
        mock.releaseHeldCalls()
        await fulfillment(of: [staleSettled], timeout: 5)

        XCTAssertEqual(mock.resumeCallCount, 1, "actuator resume must have been called exactly once")
        XCTAssertFalse(sut.isVideoSuspended, "after reset(), suspended state must remain cleared")

        // Probe the policy state reset() left: a fresh degraded streak suspends.
        mock.hold = .none
        let probeExp = expectation(description: "post-reset suspend")
        mock.onTransition = { probeExp.fulfill() }
        let probeSettled = expectation(description: "post-reset suspend settled")
        sut.onTransitionSettled = { probeSettled.fulfill() }
        sut.handle(level: .poor, userWantsVideo: true)
        advance(6)
        sut.handle(level: .poor, userWantsVideo: true)
        await fulfillment(of: [probeExp, probeSettled], timeout: 5, enforceOrder: true)
        XCTAssertEqual(mock.suspendCallCount, 2, "the stale resume failure must not have rewritten the policy state")
        XCTAssertTrue(sut.isVideoSuspended)
    }

    // MARK: reset() cancels the in-flight transition Task

    func test_resetMidTransition_cancelsInFlightTaskInsteadOfRunningOutTheTimeout() async {
        // Regression guard: reset() must cancel the in-flight suspend/resume Task,
        // not just ignore its eventual result. Before the fix, a call ending
        // mid-transition left suspendOutboundVideo()/resumeOutboundVideo() running
        // for up to `transitionTimeout` after the call had already visibly ended —
        // wasted battery/network for no purpose.
        //
        // The actuator is held until released OR cancelled, and this test never
        // releases it before the verdict: only reset()'s cancellation can end the
        // hold. Without the fix, the hold outlives the expectation's deadline.
        let (sut, mock, advance) = makeSUT(transitionTimeout: 20)
        mock.hold = .untilReleasedOrCancelled

        let startedExp = expectation(description: "suspend started")
        mock.onTransition = { startedExp.fulfill() }
        let hangCompleteExp = expectation(description: "hold cut short by cancellation")
        mock.onHangComplete = { hangCompleteExp.fulfill() }

        sut.handle(level: .poor, userWantsVideo: true)
        advance(6)
        sut.handle(level: .poor, userWantsVideo: true) // triggers suspend, actuator now held

        await fulfillment(of: [startedExp], timeout: 5)

        sut.reset()

        await fulfillment(of: [hangCompleteExp], timeout: 5)
        mock.releaseHeldCalls()
    }

    // MARK: isTransitioning guard

    func test_qualityImprovementDuringInFlightSuspend_doesNotStartConcurrentResume() async {
        // While a suspend renegotiation is in-flight, quality improves. The controller
        // must NOT start a concurrent resume (SDP glare: two in-flight renegotiations
        // would produce an offer collision that triggers W3C §3.4 perfect-negotiation).
        let (sut, mock, advance) = makeSUT()
        mock.hold = .untilReleased

        let suspendStartedExp = expectation(description: "suspend started")
        mock.onTransition = { suspendStartedExp.fulfill() }
        sut.handle(level: .poor, userWantsVideo: true)
        advance(6)
        sut.handle(level: .poor, userWantsVideo: true) // in-flight suspend
        await fulfillment(of: [suspendStartedExp], timeout: 5)

        // A SUSTAINED good streak arrives while the suspend is held in flight —
        // enough for the policy to resume, were the samples not dropped.
        sut.handle(level: .good, userWantsVideo: true)
        advance(10)
        sut.handle(level: .good, userWantsVideo: true)
        XCTAssertEqual(mock.resumeCallCount, 0,
                       "resume must not start while suspend is in-flight — isTransitioning guard")

        let suspendSettled = expectation(description: "suspend settled")
        sut.onTransitionSettled = { suspendSettled.fulfill() }
        mock.releaseHeldCalls()
        await fulfillment(of: [suspendSettled], timeout: 5)
        XCTAssertTrue(sut.isVideoSuspended)
        XCTAssertEqual(mock.resumeCallCount, 0, "resume must still be 0 — quality ticks were dropped")
    }

    func test_qualityFeedAfterTransitionCompletes_resumesNormally() async {
        // After the in-flight suspend completes, the NEXT quality tick that sees sustained
        // good quality must be able to start recovery (the controller is unblocked).
        let (sut, mock, advance) = makeSUT()
        mock.hold = .untilReleased

        let suspendExp = expectation(description: "suspend")
        mock.onTransition = { suspendExp.fulfill() }
        sut.handle(level: .poor, userWantsVideo: true)
        advance(6)
        sut.handle(level: .poor, userWantsVideo: true)
        await fulfillment(of: [suspendExp], timeout: 5)

        let suspendSettled = expectation(description: "suspend settled")
        sut.onTransitionSettled = { suspendSettled.fulfill() }
        mock.hold = .none
        mock.releaseHeldCalls()
        await fulfillment(of: [suspendSettled], timeout: 5)
        XCTAssertTrue(sut.isVideoSuspended)

        // Now feed sustained good quality — recovery window starts fresh.
        let resumeExp = expectation(description: "resume")
        mock.onTransition = { resumeExp.fulfill() }
        let resumeSettled = expectation(description: "resume settled")
        sut.onTransitionSettled = { resumeSettled.fulfill() }
        sut.handle(level: .good, userWantsVideo: true)  // start recovery
        advance(10)
        sut.handle(level: .good, userWantsVideo: true)  // -> resume
        await fulfillment(of: [resumeExp, resumeSettled], timeout: 5, enforceOrder: true)
        XCTAssertEqual(mock.resumeCallCount, 1)
        XCTAssertFalse(sut.isVideoSuspended)
    }
}

// MARK: - VideoSurvivalPolicy default-init regression guards

@MainActor
final class VideoSurvivalPolicySourceGuardTests: XCTestCase {

    private func videoSurvivalSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/VideoSurvivalController.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_videoSurvivalPolicy_suspendAfter_usesQualityThresholdsConstant() throws {
        let source = try videoSurvivalSource()
        XCTAssertTrue(
            source.contains("videoSurvivalSuspendAfterSeconds"),
            "VideoSurvivalPolicy.init suspendAfter default must reference QualityThresholds.videoSurvivalSuspendAfterSeconds"
        )
    }

    func test_videoSurvivalPolicy_resumeAfter_usesQualityThresholdsConstant() throws {
        let source = try videoSurvivalSource()
        XCTAssertTrue(
            source.contains("videoSurvivalResumeAfterSeconds"),
            "VideoSurvivalPolicy.init resumeAfter default must reference QualityThresholds.videoSurvivalResumeAfterSeconds"
        )
    }
}
