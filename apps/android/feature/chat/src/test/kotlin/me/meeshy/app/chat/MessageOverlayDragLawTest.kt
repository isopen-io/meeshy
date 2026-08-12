package me.meeshy.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Behavioural port of the iOS `MessageOverlayDragLawTests`. Exercises the pure
 * vertical-drag law of the long-press overlay menu through its public API:
 * every directional arm of [MessageOverlayDragLaw.outcome], the damped
 * [MessageOverlayDragLaw.displayOffset] rubber-band, and the [MessageOverlayDragLaw.isArmed]
 * threshold. No implementation detail is asserted — only observable outcomes.
 */
class MessageOverlayDragLawTest {

    // region outcome — swipe up (open "More…")

    @Test
    fun outcome_strongSwipeUp_opensMore() {
        assertEquals(
            MessageOverlayDragOutcome.OpenMore,
            MessageOverlayDragLaw.outcome(translation = -80f, predicted = -80f),
        )
        assertEquals(
            MessageOverlayDragOutcome.OpenMore,
            MessageOverlayDragLaw.outcome(translation = -140f, predicted = -140f),
        )
    }

    @Test
    fun outcome_weakSwipeUp_snapsBack() {
        assertEquals(
            MessageOverlayDragOutcome.SnapBack,
            MessageOverlayDragLaw.outcome(translation = -40f, predicted = -60f),
        )
        assertEquals(
            MessageOverlayDragOutcome.SnapBack,
            MessageOverlayDragLaw.outcome(translation = -79.9f, predicted = -79.9f),
        )
    }

    @Test
    fun outcome_upVelocityInDragDirection_opensMore() {
        // Under the position threshold, but a strong projected up-velocity commits.
        assertEquals(
            MessageOverlayDragOutcome.OpenMore,
            MessageOverlayDragLaw.outcome(translation = -30f, predicted = -200f),
        )
        assertEquals(
            MessageOverlayDragOutcome.OpenMore,
            MessageOverlayDragLaw.outcome(translation = -30f, predicted = -160f),
        )
    }

    @Test
    fun outcome_upVelocityAtPredictionBoundary_opensMore() {
        // predicted == openMoreThreshold * predictionFactor (-160) with a negative
        // translation is exactly on the inclusive velocity boundary.
        assertEquals(
            MessageOverlayDragOutcome.OpenMore,
            MessageOverlayDragLaw.outcome(translation = -1f, predicted = -160f),
        )
    }

    @Test
    fun outcome_upVelocityAgainstDragDirection_ignored() {
        // Dragging down but flinging up: velocity in the wrong direction is inert.
        assertEquals(
            MessageOverlayDragOutcome.SnapBack,
            MessageOverlayDragLaw.outcome(translation = 10f, predicted = -200f),
        )
    }

    @Test
    fun outcome_dragUpBeyondThresholdThenFlingDown_opensMore() {
        // Position past the up-threshold wins even against a down-fling: cancelling
        // requires sliding back under the threshold before release.
        assertEquals(
            MessageOverlayDragOutcome.OpenMore,
            MessageOverlayDragLaw.outcome(translation = -100f, predicted = 200f),
        )
    }

    // endregion

    // region outcome — swipe down (dismiss)

    @Test
    fun outcome_strongSwipeDown_dismisses() {
        assertEquals(
            MessageOverlayDragOutcome.Dismiss,
            MessageOverlayDragLaw.outcome(translation = 80f, predicted = 80f),
        )
        assertEquals(
            MessageOverlayDragOutcome.Dismiss,
            MessageOverlayDragLaw.outcome(translation = 140f, predicted = 140f),
        )
    }

    @Test
    fun outcome_weakSwipeDown_snapsBack() {
        assertEquals(
            MessageOverlayDragOutcome.SnapBack,
            MessageOverlayDragLaw.outcome(translation = 40f, predicted = 50f),
        )
    }

    @Test
    fun outcome_downVelocityInDragDirection_dismisses() {
        assertEquals(
            MessageOverlayDragOutcome.Dismiss,
            MessageOverlayDragLaw.outcome(translation = 30f, predicted = 200f),
        )
        assertEquals(
            MessageOverlayDragOutcome.Dismiss,
            MessageOverlayDragLaw.outcome(translation = 30f, predicted = 160f),
        )
    }

    @Test
    fun outcome_downVelocityAgainstDragDirection_ignored() {
        assertEquals(
            MessageOverlayDragOutcome.SnapBack,
            MessageOverlayDragLaw.outcome(translation = -10f, predicted = 200f),
        )
    }

    @Test
    fun outcome_zeroDrag_snapsBack() {
        assertEquals(
            MessageOverlayDragOutcome.SnapBack,
            MessageOverlayDragLaw.outcome(translation = 0f, predicted = 0f),
        )
    }

    @Test
    fun outcome_upTakesPriorityOverDownWhenBothArmed() {
        // A translation past the up-threshold is checked before the down arm, so a
        // pathological both-armed input resolves to OpenMore, never Dismiss.
        assertEquals(
            MessageOverlayDragOutcome.OpenMore,
            MessageOverlayDragLaw.outcome(translation = -90f, predicted = -90f),
        )
    }

    // endregion

    // region displayOffset — 1:1 tracking then damped rubber-band

    @Test
    fun displayOffset_underThresholds_followsFingerOneToOne() {
        assertEquals(0f, MessageOverlayDragLaw.displayOffset(0f), 0.0001f)
        assertEquals(-50f, MessageOverlayDragLaw.displayOffset(-50f), 0.0001f)
        assertEquals(50f, MessageOverlayDragLaw.displayOffset(50f), 0.0001f)
        assertEquals(-80f, MessageOverlayDragLaw.displayOffset(-80f), 0.0001f)
        assertEquals(80f, MessageOverlayDragLaw.displayOffset(80f), 0.0001f)
    }

    @Test
    fun displayOffset_beyondUpThreshold_isDamped() {
        // -80 + (-120 - -80) * 0.3 = -80 + (-40 * 0.3) = -92
        assertEquals(-92f, MessageOverlayDragLaw.displayOffset(-120f), 0.001f)
    }

    @Test
    fun displayOffset_beyondDownThreshold_isDamped() {
        // 80 + (120 - 80) * 0.3 = 80 + 12 = 92
        assertEquals(92f, MessageOverlayDragLaw.displayOffset(120f), 0.001f)
    }

    @Test
    fun displayOffset_staysMonotonic_beyondThreshold() {
        assertTrue(
            MessageOverlayDragLaw.displayOffset(-200f) <
                MessageOverlayDragLaw.displayOffset(-120f),
        )
        assertTrue(
            MessageOverlayDragLaw.displayOffset(200f) >
                MessageOverlayDragLaw.displayOffset(120f),
        )
    }

    @Test
    fun displayOffset_dampedTravelIsCompressedVersusRawFinger() {
        // The damped offset past the threshold must trail the raw finger travel:
        // proof the rubber-band compresses rather than tracks 1:1.
        assertTrue(MessageOverlayDragLaw.displayOffset(-200f) > -200f)
        assertTrue(MessageOverlayDragLaw.displayOffset(200f) < 200f)
    }

    // endregion

    // region isArmed

    @Test
    fun isArmed_atOrBeyondUpThreshold_isTrue() {
        assertTrue(MessageOverlayDragLaw.isArmed(-80f))
        assertTrue(MessageOverlayDragLaw.isArmed(-120f))
    }

    @Test
    fun isArmed_underThresholdOrDownward_isFalse() {
        assertFalse(MessageOverlayDragLaw.isArmed(-79.9f))
        assertFalse(MessageOverlayDragLaw.isArmed(0f))
        assertFalse(MessageOverlayDragLaw.isArmed(80f))
    }

    // endregion
}
