package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCubeTransformTest {

    private val width = 1000f

    @Test
    fun `a face turns ninety degrees per width and stops just before its profile`() {
        assertThat(StoryCubeTransform.faceDegrees(-500f, width)).isWithin(1e-4f).of(-45f)
        assertThat(StoryCubeTransform.faceDegrees(width, width)).isEqualTo(StoryCubeTransform.EDGE_DEGREES)
        assertThat(StoryCubeTransform.faceDegrees(-3 * width, width)).isEqualTo(-StoryCubeTransform.EDGE_DEGREES)
        assertThat(StoryCubeTransform.faceDegrees(100f, 0f)).isEqualTo(StoryCubeTransform.EDGE_DEGREES)
    }

    @Test
    fun `dragging left hinges the face on the edge shared with the next author`() {
        assertThat(StoryCubeTransform.faceDegrees(-200f, width)).isLessThan(0f)
        assertThat(StoryCubeTransform.pivotFractionX(-200f)).isEqualTo(1f)
        assertThat(StoryCubeTransform.faceDegrees(200f, width)).isGreaterThan(0f)
        assertThat(StoryCubeTransform.pivotFractionX(200f)).isEqualTo(0f)
    }

    @Test
    fun `a face darkens as it turns away from the viewer`() {
        assertThat(StoryCubeTransform.shade(0f, width)).isEqualTo(0f)
        assertThat(StoryCubeTransform.shade(-500f, width)).isWithin(1e-3f).of(0.45f * 0.7071f)
        assertThat(StoryCubeTransform.shade(width, width)).isWithin(1e-3f).of(StoryCubeTransform.MAXIMUM_SHADE)
    }

    @Test
    fun `the camera stands back by the iOS distance expressed in Skia inches`() {
        assertThat(StoryCubeTransform.cameraDistance(1080f)).isWithin(1e-3f).of(2.2f * 1080f / 72f)
    }

    @Test
    fun `the card pulled down shrinks and fades like on iPhone and ignores an upward pull`() {
        val travel = 350f
        assertThat(StoryCubeTransform.dismissProgress(-100f, travel)).isEqualTo(0f)
        assertThat(StoryCubeTransform.dismissProgress(175f, travel)).isWithin(1e-6f).of(0.5f)
        assertThat(StoryCubeTransform.dismissProgress(900f, travel)).isEqualTo(1f)
        assertThat(StoryCubeTransform.dismissScale(1f)).isWithin(1e-6f).of(0.65f)
        assertThat(StoryCubeTransform.dismissAlpha(1f)).isWithin(1e-6f).of(0.7f)
        assertThat(StoryCubeTransform.dismissScale(0f)).isEqualTo(1f)
    }

    private fun decide(translation: Float, predicted: Float = translation, next: Boolean = true, previous: Boolean = true) =
        StoryGroupSwipeDecision.decide(translation, predicted, width, hasNext = next, hasPrevious = previous)

    @Test
    fun `a drag past half the width opens the neighbouring author`() {
        assertThat(decide(-600f)).isEqualTo(StoryGroupSwipeOutcome.Next)
        assertThat(decide(600f)).isEqualTo(StoryGroupSwipeOutcome.Previous)
    }

    @Test
    fun `a short drag springs back unless a flick carries it past half the width`() {
        assertThat(decide(-200f)).isEqualTo(StoryGroupSwipeOutcome.Cancel)
        assertThat(decide(-200f, predicted = -700f)).isEqualTo(StoryGroupSwipeOutcome.Next)
    }

    @Test
    fun `a finger heading back toward the origin cancels even far into the course`() {
        assertThat(decide(-800f, predicted = -600f)).isEqualTo(StoryGroupSwipeOutcome.Cancel)
        assertThat(decide(-800f, predicted = -780f)).isEqualTo(StoryGroupSwipeOutcome.Next)
    }

    @Test
    fun `no neighbour in the gesture direction cancels`() {
        assertThat(decide(-800f, next = false)).isEqualTo(StoryGroupSwipeOutcome.Cancel)
        assertThat(decide(800f, previous = false)).isEqualTo(StoryGroupSwipeOutcome.Cancel)
    }

    @Test
    fun `the inertial projection extends the course by the velocity horizon`() {
        assertThat(StoryGroupSwipeDecision.predictedEnd(-100f, -2000f))
            .isWithin(1e-3f).of(-100f - 2000f * StoryGroupSwipeDecision.PROJECTION_SECONDS)
    }

    @Test
    fun `a drag toward a missing neighbour resists asymptotically and keeps its sign`() {
        val limit = width * StoryGroupSwipeDecision.EDGE_RESISTANCE_IN_WIDTHS
        val near = StoryGroupSwipeDecision.displayedTranslation(-100f, width, hasNeighbor = false)
        val far = StoryGroupSwipeDecision.displayedTranslation(-5000f, width, hasNeighbor = false)
        assertThat(near).isLessThan(0f)
        assertThat(near).isGreaterThan(-100f)
        assertThat(far).isGreaterThan(-limit)
        assertThat(far).isLessThan(near)
        assertThat(StoryGroupSwipeDecision.displayedTranslation(100f, width, hasNeighbor = false)).isGreaterThan(0f)
    }

    @Test
    fun `a drag toward an existing neighbour is followed one to one`() {
        assertThat(StoryGroupSwipeDecision.displayedTranslation(-100f, width, hasNeighbor = true)).isEqualTo(-100f)
    }

    @Test
    fun `pulling down past the threshold or flicking far enough closes the viewer`() {
        assertThat(StoryVerticalSwipeDecision.dismisses(130f, 130f, threshold = 120f)).isTrue()
        assertThat(StoryVerticalSwipeDecision.dismisses(60f, 320f, threshold = 120f)).isTrue()
        assertThat(StoryVerticalSwipeDecision.dismisses(60f, 200f, threshold = 120f)).isFalse()
        assertThat(StoryVerticalSwipeDecision.dismisses(-300f, -300f, threshold = 120f)).isFalse()
    }

    @Test
    fun `an open rail bar is closed by a vertical gesture in either direction`() {
        assertThat(StoryVerticalSwipeDecision.crossesThreshold(-130f, -130f, threshold = 120f)).isTrue()
        assertThat(StoryVerticalSwipeDecision.crossesThreshold(40f, 60f, threshold = 120f)).isFalse()
    }
}
