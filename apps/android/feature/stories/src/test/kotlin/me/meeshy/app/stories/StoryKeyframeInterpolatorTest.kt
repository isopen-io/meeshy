package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEasing
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure keyframe interpolation core — the Android port of iOS's
 * `StoryEasing.apply` + `KeyframeInterpolator`. No Android, no I/O: the reader canvas and any
 * future compositor read one channel's value at time `t` through this single place, so the
 * clamp/ease/lerp law lives here rather than being re-derived per call site.
 */
@RunWith(JUnit4::class)
class StoryKeyframeInterpolatorTest {

    private fun sample(time: Float, value: Double, easing: StoryEasing = StoryEasing.LINEAR) =
        KeyframeChannelSample(time = time, value = value, easing = easing)

    // --- easing curves ---

    @Test
    fun `every easing curve pins its endpoints to 0 and 1`() {
        for (easing in StoryEasing.entries) {
            assertThat(easing.eased(0f)).isWithin(1e-6f).of(0f)
            assertThat(easing.eased(1f)).isWithin(1e-6f).of(1f)
        }
    }

    @Test
    fun `linear easing is the identity`() {
        assertThat(StoryEasing.LINEAR.eased(0.25f)).isWithin(1e-6f).of(0.25f)
        assertThat(StoryEasing.LINEAR.eased(0.5f)).isWithin(1e-6f).of(0.5f)
    }

    @Test
    fun `ease-in accelerates - its midpoint sits below the diagonal`() {
        assertThat(StoryEasing.EASE_IN.eased(0.5f)).isWithin(1e-6f).of(0.25f)
    }

    @Test
    fun `ease-out decelerates - its midpoint sits above the diagonal`() {
        assertThat(StoryEasing.EASE_OUT.eased(0.5f)).isWithin(1e-6f).of(0.75f)
    }

    @Test
    fun `ease-in-out uses the accelerating arm below the half and the decelerating arm above`() {
        assertThat(StoryEasing.EASE_IN_OUT.eased(0.25f)).isWithin(1e-6f).of(0.125f)
        assertThat(StoryEasing.EASE_IN_OUT.eased(0.5f)).isWithin(1e-6f).of(0.5f)
        assertThat(StoryEasing.EASE_IN_OUT.eased(0.75f)).isWithin(1e-6f).of(0.875f)
    }

    // --- degenerate sample counts ---

    @Test
    fun `no samples resolve to null so the caller can fall back to the static value`() {
        assertThat(StoryKeyframeInterpolator.interpolate(emptyList(), at = 3f)).isNull()
    }

    @Test
    fun `a single sample holds its value for every time`() {
        val one = listOf(sample(time = 4f, value = 7.0))
        assertThat(StoryKeyframeInterpolator.interpolate(one, at = -100f)).isEqualTo(7.0)
        assertThat(StoryKeyframeInterpolator.interpolate(one, at = 4f)).isEqualTo(7.0)
        assertThat(StoryKeyframeInterpolator.interpolate(one, at = 100f)).isEqualTo(7.0)
    }

    // --- clamping outside the keyed window ---

    @Test
    fun `a time before the first sample clamps to the first value`() {
        val frames = listOf(sample(2f, 10.0), sample(6f, 30.0))
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 0f)).isEqualTo(10.0)
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 2f)).isEqualTo(10.0)
    }

    @Test
    fun `a time after the last sample clamps to the last value`() {
        val frames = listOf(sample(2f, 10.0), sample(6f, 30.0))
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 6f)).isEqualTo(30.0)
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 99f)).isEqualTo(30.0)
    }

    // --- interpolation across a segment ---

    @Test
    fun `a linear segment interpolates proportionally at its midpoint`() {
        val frames = listOf(sample(0f, 0.0), sample(10f, 100.0))
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 5f)!!).isWithin(1e-4).of(50.0)
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 2f)!!).isWithin(1e-4).of(20.0)
    }

    @Test
    fun `the segment's easing is taken from its lower keyframe`() {
        val frames = listOf(sample(0f, 0.0, StoryEasing.EASE_IN), sample(10f, 100.0))
        // u = 0.5, EASE_IN(0.5) = 0.25, so value = 0 + 100 * 0.25.
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 5f)!!).isWithin(1e-4).of(25.0)
    }

    @Test
    fun `crossing into the second segment switches to that segment's easing`() {
        val frames = listOf(
            sample(0f, 0.0, StoryEasing.LINEAR),
            sample(10f, 100.0, StoryEasing.EASE_OUT),
            sample(20f, 200.0),
        )
        // First segment stays linear at its midpoint.
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 5f)!!).isWithin(1e-4).of(50.0)
        // Second segment: u = 0.5, EASE_OUT(0.5) = 0.75, value = 100 + 100 * 0.75.
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 15f)!!).isWithin(1e-4).of(175.0)
    }

    // --- edge geometry ---

    @Test
    fun `two samples at the same time collapse to the lower value with no divide-by-zero`() {
        val frames = listOf(sample(5f, 10.0), sample(5f, 40.0))
        // at == first.time hits the low clamp; the value is the first sample's.
        assertThat(StoryKeyframeInterpolator.interpolate(frames, at = 5f)).isEqualTo(10.0)
    }

    @Test
    fun `unsorted samples resolve identically to their sorted order`() {
        val sorted = listOf(sample(0f, 0.0), sample(10f, 100.0), sample(20f, 200.0))
        val shuffled = listOf(sample(20f, 200.0), sample(0f, 0.0), sample(10f, 100.0))
        for (t in listOf(-1f, 0f, 5f, 10f, 15f, 20f, 99f)) {
            assertThat(StoryKeyframeInterpolator.interpolate(shuffled, at = t))
                .isEqualTo(StoryKeyframeInterpolator.interpolate(sorted, at = t))
        }
    }
}
