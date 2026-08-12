package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for the blurred / view-once ("tap to reveal") lifecycle — a
 * direct port of iOS `BubbleBlurRevealLifecycle` plus the reveal→re-conceal sequence
 * that `BubbleBlurRevealController.scheduleReveal()` runs imperatively inside a `Task`
 * (`BubbleBlurRevealLifecycle.swift`).
 *
 * iOS hides its fog→re-blur→fog animation inside a `Task`, so its timing is untestable;
 * here the whole sequence is the pure [BlurRevealLifecycle.revealTimeline], asserted
 * keyframe by keyframe (a deliberate improvement over iOS).
 */
class BlurRevealLifecycleTest {

    // MARK: - phase durations (parity with iOS Phase.duration)

    @Test
    fun phase_durations_matchIos() {
        assertThat(BlurRevealLifecycle.Phase.FogIn.durationSeconds).isEqualTo(0.4)
        assertThat(BlurRevealLifecycle.Phase.BlurApply.durationSeconds).isEqualTo(0.4)
        assertThat(BlurRevealLifecycle.Phase.FogOut.durationSeconds).isEqualTo(0.5)
    }

    @Test
    fun defaultRevealDuration_isFiveSeconds() {
        assertThat(BlurRevealLifecycle.defaultRevealDurationSeconds).isEqualTo(5.0)
    }

    // MARK: - RevealRequest.requiresConsume (iOS RevealRequest.requiresConsume == isViewOnce)

    @Test
    fun revealRequest_viewOnce_requiresConsume() {
        val request = BlurRevealLifecycle.RevealRequest(messageId = "m1", isViewOnce = true)
        assertThat(request.requiresConsume).isTrue()
    }

    @Test
    fun revealRequest_blurredOnly_doesNotRequireConsume() {
        val request = BlurRevealLifecycle.RevealRequest(messageId = "m1", isViewOnce = false)
        assertThat(request.requiresConsume).isFalse()
    }

    // MARK: - revealTimeline shape

    @Test
    fun revealTimeline_hasRevealFogInReblurFogOut() {
        assertThat(BlurRevealLifecycle.revealTimeline()).hasSize(4)
    }

    @Test
    fun revealTimeline_firstStep_revealsImmediately() {
        val step = BlurRevealLifecycle.revealTimeline().first()
        assertThat(step.atMillis).isEqualTo(0)
        assertThat(step.isRevealed).isTrue()
        assertThat(step.fogOpacity).isEqualTo(0.0)
    }

    @Test
    fun revealTimeline_fogInStep_condensesAtVisibilityWindow() {
        // default visibility = 5s → fog condenses in at 5000ms over 0.4s
        val step = BlurRevealLifecycle.revealTimeline()[1]
        assertThat(step.atMillis).isEqualTo(5_000)
        assertThat(step.isRevealed).isTrue()
        assertThat(step.fogOpacity).isEqualTo(1.0)
        assertThat(step.animationDurationMillis).isEqualTo(400)
    }

    @Test
    fun revealTimeline_reblurStep_reappliesBlurBehindFog() {
        // iOS: fog-in (0.4) minus the 0.05 overlap → 5000 + 400 - 50 = 5350
        val step = BlurRevealLifecycle.revealTimeline()[2]
        assertThat(step.atMillis).isEqualTo(5_350)
        assertThat(step.isRevealed).isFalse()
        assertThat(step.fogOpacity).isEqualTo(1.0)
        assertThat(step.animationDurationMillis).isEqualTo(400)
    }

    @Test
    fun revealTimeline_fogOutStep_dissipatesAndEndsConcealed() {
        // iOS: 5350 + blurApply (0.4) + the 0.05 overlap → 5350 + 400 + 50 = 5800
        val step = BlurRevealLifecycle.revealTimeline()[3]
        assertThat(step.atMillis).isEqualTo(5_800)
        assertThat(step.isRevealed).isFalse()
        assertThat(step.fogOpacity).isEqualTo(0.0)
        assertThat(step.animationDurationMillis).isEqualTo(500)
    }

    @Test
    fun revealTimeline_endsConcealed() {
        val last = BlurRevealLifecycle.revealTimeline().last()
        assertThat(last.isRevealed).isFalse()
        assertThat(last.fogOpacity).isEqualTo(0.0)
    }

    // MARK: - custom / clamped visibility windows

    @Test
    fun revealTimeline_customVisibility_shiftsAllPhases() {
        val steps = BlurRevealLifecycle.revealTimeline(visibilitySeconds = 2.0)
        assertThat(steps[1].atMillis).isEqualTo(2_000) // fog-in at the window
        assertThat(steps[2].atMillis).isEqualTo(2_350) // + 400 - 50
        assertThat(steps[3].atMillis).isEqualTo(2_800) // + 400 + 50
    }

    @Test
    fun revealTimeline_negativeVisibility_clampsToZero() {
        val steps = BlurRevealLifecycle.revealTimeline(visibilitySeconds = -3.0)
        assertThat(steps[1].atMillis).isEqualTo(0)   // window clamped to 0 (never scheduled in the past)
        assertThat(steps[2].atMillis).isEqualTo(350) // 0 + 400 - 50
        assertThat(steps[3].atMillis).isEqualTo(800) // 350 + 400 + 50
    }

    @Test
    fun revealTimeline_offsets_areMonotonicNonDecreasing() {
        listOf(-1.0, 0.0, 2.0, 5.0, 30.0).forEach { visibility ->
            val offsets = BlurRevealLifecycle.revealTimeline(visibility).map { it.atMillis }
            assertThat(offsets).isInOrder()
        }
    }
}
