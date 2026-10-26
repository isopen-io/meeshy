package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCubeTransformTest {

    @Test
    fun `fraction is clamped to the width and zero on an unmeasured canvas`() {
        assertThat(StoryCubeTransform.fraction(-500f, 400f)).isEqualTo(-1f)
        assertThat(StoryCubeTransform.fraction(100f, 400f)).isEqualTo(0.25f)
        assertThat(StoryCubeTransform.fraction(100f, 0f)).isEqualTo(0f)
    }

    @Test
    fun `dragging left opens the face toward the next author around the right edge`() {
        val fraction = StoryCubeTransform.fraction(-200f, 400f)
        assertThat(StoryCubeTransform.rotationYDegrees(fraction)).isLessThan(0f)
        assertThat(StoryCubeTransform.pivotFractionX(fraction)).isEqualTo(1f)
    }

    @Test
    fun `dragging right pivots on the left edge with a positive rotation`() {
        val fraction = StoryCubeTransform.fraction(200f, 400f)
        assertThat(StoryCubeTransform.rotationYDegrees(fraction)).isGreaterThan(0f)
        assertThat(StoryCubeTransform.pivotFractionX(fraction)).isEqualTo(0f)
    }

    @Test
    fun `a full width drag turns the face by the maximum angle`() {
        assertThat(StoryCubeTransform.rotationYDegrees(1f)).isEqualTo(StoryCubeTransform.MAX_ROTATION_DEGREES)
    }

    @Test
    fun `a drag toward a missing neighbour resists`() {
        assertThat(StoryCubeTransform.resisted(-100f, hasNextGroup = false, hasPreviousGroup = true))
            .isEqualTo(-100f * StoryCubeTransform.EDGE_RESISTANCE)
        assertThat(StoryCubeTransform.resisted(100f, hasNextGroup = true, hasPreviousGroup = false))
            .isEqualTo(100f * StoryCubeTransform.EDGE_RESISTANCE)
    }

    @Test
    fun `a drag toward an existing neighbour is followed one to one`() {
        assertThat(StoryCubeTransform.resisted(-100f, hasNextGroup = true, hasPreviousGroup = false)).isEqualTo(-100f)
        assertThat(StoryCubeTransform.resisted(100f, hasNextGroup = false, hasPreviousGroup = true)).isEqualTo(100f)
    }

    @Test
    fun `the card shrinks and fades as it is pulled down and ignores an upward pull`() {
        assertThat(StoryCubeTransform.dismissScale(0f, 1000f)).isEqualTo(1f)
        assertThat(StoryCubeTransform.dismissScale(1000f, 1000f)).isWithin(1e-6f).of(0.85f)
        assertThat(StoryCubeTransform.dismissAlpha(1000f, 1000f)).isWithin(1e-6f).of(0.5f)
        assertThat(StoryCubeTransform.dismissScale(-300f, 1000f)).isEqualTo(1f)
        assertThat(StoryCubeTransform.dismissAlpha(-300f, 1000f)).isEqualTo(1f)
    }

    @Test
    fun `the dominant axis separates an author change from a dismissal`() {
        assertThat(StoryCubeTransform.isHorizontal(80f, 20f)).isTrue()
        assertThat(StoryCubeTransform.isHorizontal(20f, 80f)).isFalse()
    }
}
