import XCTest
@testable import Meeshy

/// Pinning tests for `StoryGestureDecisions` — the pure decision helpers
/// behind the story viewer's tap/long-press overlay. The semantic these
/// tests pin down :
///
/// - `isPaused` is the **single source of truth** for the long-press toggle.
/// - Long-press ≥ 200 ms ⇒ `isPaused` becomes `true` (timer + bg video +
///   audio + effects freeze together). Release of the hold does **not**
///   resume — the story stays paused.
/// - Next short tap on a paused story ⇒ resumes (`isPaused = false`) and
///   does **not** navigate.
/// - Short tap on a playing story ⇒ navigate prev/next based on side.
/// - Composer engaged ⇒ tap dismisses the composer instead.
final class StoryGestureDecisionsTests: XCTestCase {

    // MARK: - decideTouchDown

    func test_touchDown_whenPlaying_returnsNone() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx), .none)
    }

    func test_touchDown_whenPaused_returnsResumeFromPause() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx), .resumeFromPause)
    }

    func test_touchDown_whenPausedButComposerEngaged_returnsNone() {
        // Composer focus suppresses the resume tap — the composer dismiss
        // gesture is handled by the touch-up branch.
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: true
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx), .none)
    }

    // MARK: - decideTouchUp — composer engaged

    func test_touchUp_whenComposerEngaged_dismissesComposer() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: true
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            halfWidth: 200,
            elapsed: 0.05,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .dismissComposer)
    }

    // MARK: - decideTouchUp — resuming tap

    func test_touchUp_whenResumingTap_returnsNone_noNavigation() {
        // A short tap that came in on a paused story already flipped
        // `isPaused = false` at touch-down — the release must be a no-op.
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: true,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 350,   // right half — would normally navigate next
            halfWidth: 200,
            elapsed: 0.06,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .none, "Resuming tap must NEVER trigger navigation")
    }

    // MARK: - decideTouchUp — long-press confirmed

    func test_touchUp_whenHoldActive_confirmsLongPressPause() {
        // Hold task fired ≥200 ms ago → `holdActive = true`, `isPaused` was
        // flipped to true. Release just confirms the latch.
        let ctx = StoryGestureContext(
            holdActive: true,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            halfWidth: 200,
            elapsed: 0.25,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .confirmLongPressPause)
    }

    // MARK: - decideTouchUp — race window

    func test_touchUp_elapsedExceedsThreshold_butHoldInactive_returnsNone() {
        // Edge case : the user held just past the threshold but the hold
        // task hasn't ticked yet. We refuse to navigate (would feel like a
        // hover-cancel jumping forward) and refuse to latch (we never
        // committed the pause). Just a no-op.
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            halfWidth: 200,
            elapsed: 0.21,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .none)
    }

    // MARK: - decideTouchUp — short tap navigation

    func test_touchUp_shortTapLeftHalf_navigatesPrevious() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            halfWidth: 200,
            elapsed: 0.05,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .navigatePrevious)
    }

    func test_touchUp_shortTapRightHalf_navigatesNext() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 300,
            halfWidth: 200,
            elapsed: 0.05,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .navigateNext)
    }

    func test_touchUp_shortTapExactlyAtHalfWidth_navigatesNext() {
        // Boundary check : `touchStartX < halfWidth` is the prev condition;
        // exact equality should fall through to `next`.
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 200,
            halfWidth: 200,
            elapsed: 0.05,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .navigateNext)
    }

    // MARK: - End-to-end flow

    /// Scénario complet : story en lecture → long-press → pause confirmée
    /// au release → tap suivant → reprise sans navigation.
    func test_endToEnd_longPressThenTap_pauseAndResume() {
        // 1. Touch-down sur story en lecture : pas de resume, hold s'arme.
        var ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx), .none)

        // 2. Après 200 ms, le hold se confirme dans la View (poserait
        // holdActive = true et isPaused = true).
        ctx.holdActive = true
        ctx.isPaused = true

        // 3. Release : on confirme la pause, pas de nav.
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchUp(
                context: ctx,
                touchStartX: 50,
                halfWidth: 200,
                elapsed: 0.25,
                holdThreshold: 0.2
            ),
            .confirmLongPressPause
        )

        // 4. Nouveau touch-down (story toujours paused) : reprend la lecture.
        ctx = StoryGestureContext(
            holdActive: false,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx), .resumeFromPause)

        // 5. La View pose isResumingTap = true et isPaused = false pour le
        // reste du geste. Release : no-op, surtout pas de nav.
        ctx.isPaused = false
        ctx.isResumingTap = true
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchUp(
                context: ctx,
                touchStartX: 350,
                halfWidth: 200,
                elapsed: 0.08,
                holdThreshold: 0.2
            ),
            .none
        )
    }
}
