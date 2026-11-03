package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure canvas snapping math. The resolver owns where a
 * dragged element's centre settles, which alignment guide lines light up, and whether
 * the centre is still inside the safe zone — so the canvas Composable stays glue. No
 * Android, no I/O.
 */
@RunWith(JUnit4::class)
class StorySnapResolverTest {

    private val tol = 1e-4f

    // --- free drag (no snap) ---

    @Test
    fun `a centre far from every guide stays free with no guide lines`() {
        val r = StorySnapResolver.resolve(0.1f, 0.1f)

        assertThat(r.x).isWithin(tol).of(0.1f)
        assertThat(r.y).isWithin(tol).of(0.1f)
        assertThat(r.verticalGuide).isNull()
        assertThat(r.horizontalGuide).isNull()
        assertThat(r.isSnapped).isFalse()
        assertThat(r.withinSafeZone).isTrue()
    }

    @Test
    fun `a centre between two guides but beyond the threshold of both does not snap`() {
        val r = StorySnapResolver.resolve(0.42f, 0.5f)

        assertThat(r.x).isWithin(tol).of(0.42f)
        assertThat(r.verticalGuide).isNull()
    }

    // --- snapping ---

    @Test
    fun `a centre near the middle locks onto the centre guide on both axes`() {
        val r = StorySnapResolver.resolve(0.51f, 0.49f)

        assertThat(r.x).isEqualTo(0.5f)
        assertThat(r.y).isEqualTo(0.5f)
        assertThat(r.verticalGuide).isEqualTo(0.5f)
        assertThat(r.horizontalGuide).isEqualTo(0.5f)
        assertThat(r.isSnapped).isTrue()
    }

    @Test
    fun `a centre near each iOS object target snaps to it`() {
        listOf(0.18f, 0.25f, 0.5f, 0.75f, 0.82f).forEach { target ->
            val r = StorySnapResolver.resolve(target + 0.015f, target - 0.015f)

            assertThat(r.x).isEqualTo(target)
            assertThat(r.y).isEqualTo(target)
            assertThat(r.verticalGuide).isEqualTo(target)
            assertThat(r.horizontalGuide).isEqualTo(target)
        }
    }

    @Test
    fun `the old rule-of-thirds lines no longer attract`() {
        val r = StorySnapResolver.resolve(1f / 3f, 2f / 3f)

        assertThat(r.verticalGuide).isNull()
        assertThat(r.horizontalGuide).isNull()
    }

    @Test
    fun `the object targets are exactly the iOS ones`() {
        assertThat(StorySnapResolver.OBJECT_TARGETS).containsExactly(0.18f, 0.25f, 0.5f, 0.75f, 0.82f).inOrder()
        assertThat(StorySnapResolver.VERTICAL_GUIDES).isEqualTo(StorySnapResolver.OBJECT_TARGETS)
        assertThat(StorySnapResolver.HORIZONTAL_GUIDES).isEqualTo(StorySnapResolver.OBJECT_TARGETS)
    }

    // --- background framing ---

    @Test
    fun `the background snaps to the centre and to both edges within 0,035`() {
        val centre = StorySnapResolver.resolveBackground(0.52f, 0.48f)
        assertThat(centre.x).isEqualTo(0.5f)
        assertThat(centre.y).isEqualTo(0.5f)

        val edges = StorySnapResolver.resolveBackground(0.03f, 0.97f)
        assertThat(edges.x).isEqualTo(0f)
        assertThat(edges.y).isEqualTo(1f)
        assertThat(edges.verticalGuide).isEqualTo(0f)
        assertThat(edges.horizontalGuide).isEqualTo(1f)
    }

    @Test
    fun `the background tolerance is wider than the object one and stops at 0,035`() {
        assertThat(StorySnapResolver.resolveBackground(0.53f, 0.5f).verticalGuide).isEqualTo(0.5f)
        assertThat(StorySnapResolver.resolveBackground(0.54f, 0.5f).verticalGuide).isNull()
        assertThat(StorySnapResolver.BACKGROUND_SNAP_THRESHOLD).isEqualTo(0.035f)
        assertThat(StorySnapResolver.BACKGROUND_TARGETS).containsExactly(0f, 0.5f, 1f).inOrder()
    }

    @Test
    fun `the background framing is never flagged out of the safe zone`() {
        assertThat(StorySnapResolver.resolveBackground(0f, 1f).withinSafeZone).isTrue()
    }

    @Test
    fun `the two axes snap independently — vertical guide while the row is free`() {
        val r = StorySnapResolver.resolve(0.5f, 0.1f)

        assertThat(r.verticalGuide).isEqualTo(0.5f)
        assertThat(r.horizontalGuide).isNull()
        assertThat(r.y).isWithin(tol).of(0.1f)
        assertThat(r.isSnapped).isTrue()
    }

    // --- threshold boundary ---

    @Test
    fun `a centre just inside the threshold from a guide snaps`() {
        val r = StorySnapResolver.resolve(0.5f + StorySnapResolver.SNAP_THRESHOLD - 0.002f, 0.5f)

        assertThat(r.x).isEqualTo(0.5f)
        assertThat(r.verticalGuide).isEqualTo(0.5f)
    }

    @Test
    fun `a centre just past the threshold from a guide drags free`() {
        val r = StorySnapResolver.resolve(0.5f + StorySnapResolver.SNAP_THRESHOLD + 0.01f, 0.5f)

        assertThat(r.x).isWithin(tol).of(0.5f + StorySnapResolver.SNAP_THRESHOLD + 0.01f)
        assertThat(r.verticalGuide).isNull()
    }

    @Test
    fun `a non-positive threshold disables snapping even at an exact guide`() {
        val r = StorySnapResolver.resolve(0.5f, 0.5f, threshold = 0f)

        assertThat(r.x).isEqualTo(0.5f)
        assertThat(r.verticalGuide).isNull()
        assertThat(r.horizontalGuide).isNull()
        assertThat(r.isSnapped).isFalse()
    }

    // --- guide list edge cases ---

    @Test
    fun `an empty guide list never snaps`() {
        val r = StorySnapResolver.resolve(
            0.5f,
            0.5f,
            verticalGuides = emptyList(),
            horizontalGuides = emptyList(),
        )

        assertThat(r.x).isEqualTo(0.5f)
        assertThat(r.isSnapped).isFalse()
    }

    @Test
    fun `out-of-range guides are ignored and the valid one still snaps`() {
        val r = StorySnapResolver.resolve(
            0.5f,
            0.5f,
            verticalGuides = listOf(-0.2f, 0.5f, 1.5f),
            horizontalGuides = emptyList(),
        )

        assertThat(r.verticalGuide).isEqualTo(0.5f)
        assertThat(r.horizontalGuide).isNull()
    }

    @Test
    fun `a list of only out-of-range guides never snaps`() {
        val r = StorySnapResolver.resolve(
            0.95f,
            0.5f,
            verticalGuides = listOf(1.5f, -0.2f),
            horizontalGuides = emptyList(),
        )

        assertThat(r.x).isWithin(tol).of(0.95f)
        assertThat(r.verticalGuide).isNull()
    }

    // --- clamping & non-finite ---

    @Test
    fun `an out-of-canvas candidate is clamped into the canvas`() {
        val r = StorySnapResolver.resolve(1.5f, -0.5f)

        assertThat(r.x).isEqualTo(1f)
        assertThat(r.y).isEqualTo(0f)
        assertThat(r.verticalGuide).isNull()
        assertThat(r.horizontalGuide).isNull()
    }

    @Test
    fun `a non-finite candidate collapses to the canvas centre`() {
        val r = StorySnapResolver.resolve(Float.NaN, Float.POSITIVE_INFINITY)

        assertThat(r.x).isEqualTo(0.5f)
        assertThat(r.y).isEqualTo(0.5f)
        assertThat(r.verticalGuide).isEqualTo(0.5f)
        assertThat(r.horizontalGuide).isEqualTo(0.5f)
    }

    // --- safe zone ---

    @Test
    fun `a centre at the safe-zone inset is still inside (inclusive)`() {
        val r = StorySnapResolver.resolve(
            StorySnapResolver.SAFE_ZONE_INSET,
            0.5f,
            verticalGuides = emptyList(),
        )

        assertThat(r.withinSafeZone).isTrue()
    }

    @Test
    fun `a centre past the left margin is out of the safe zone`() {
        val r = StorySnapResolver.resolve(
            StorySnapResolver.SAFE_ZONE_INSET - 0.01f,
            0.5f,
            verticalGuides = emptyList(),
        )

        assertThat(r.withinSafeZone).isFalse()
    }

    @Test
    fun `a centre past the right margin is out of the safe zone`() {
        val r = StorySnapResolver.resolve(1f, 0.5f, verticalGuides = emptyList())

        assertThat(r.withinSafeZone).isFalse()
    }

    @Test
    fun `a centre past the bottom margin is out of the safe zone`() {
        val r = StorySnapResolver.resolve(0.5f, 1f, horizontalGuides = emptyList())

        assertThat(r.withinSafeZone).isFalse()
    }

    @Test
    fun `the magnet holds at the iOS tolerance of 0,02`() {
        assertThat(StorySnapResolver.SNAP_THRESHOLD).isEqualTo(0.02f)
        assertThat(StorySnapResolver.resolve(0.53f, 0.5f).verticalGuide).isNull()
    }
}
