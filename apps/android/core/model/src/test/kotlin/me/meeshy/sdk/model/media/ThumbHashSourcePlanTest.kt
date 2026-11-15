package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Behavioural tests for [ThumbHash.sourcePlan] — the pure planner that a media write-path
 * runs BEFORE feeding a raster to [ThumbHash.encode], whose contract rejects any side
 * outside `1..100`.
 *
 * The test never re-implements the plan arithmetic; it asserts the three guarantees the
 * write-path relies on:
 *  - every returned side is a legal [ThumbHash.encode] input (`1..100`);
 *  - aspect ratio is preserved (long/short ordering and the ratio kept to within a pixel);
 *  - a source already within budget is passed through untouched (never upscaled).
 */
class ThumbHashSourcePlanTest {

    private val maxSide = 100

    // --- pass-through (already within budget, never upscaled) ---------------------

    @Test
    fun `a source within budget is returned unchanged and not marked downscaled`() {
        val plan = ThumbHash.sourcePlan(width = 50, height = 80)

        assertThat(plan.width).isEqualTo(50)
        assertThat(plan.height).isEqualTo(80)
        assertThat(plan.downscaled).isFalse()
    }

    @Test
    fun `a source exactly at the budget boundary is a pass-through`() {
        val plan = ThumbHash.sourcePlan(width = 100, height = 100)

        assertThat(plan.width).isEqualTo(100)
        assertThat(plan.height).isEqualTo(100)
        assertThat(plan.downscaled).isFalse()
    }

    @Test
    fun `a 1x1 source is a legal pass-through`() {
        val plan = ThumbHash.sourcePlan(width = 1, height = 1)

        assertThat(plan.width).isEqualTo(1)
        assertThat(plan.height).isEqualTo(1)
        assertThat(plan.downscaled).isFalse()
    }

    // --- downscale (long edge over budget) ----------------------------------------

    @Test
    fun `a square oversize source scales its long edge exactly to the budget`() {
        val plan = ThumbHash.sourcePlan(width = 200, height = 200)

        assertThat(plan.width).isEqualTo(100)
        assertThat(plan.height).isEqualTo(100)
        assertThat(plan.downscaled).isTrue()
    }

    @Test
    fun `a portrait source caps the height and derives the width by aspect ratio`() {
        // 9:16 full-HD story frame (1080x1920): height is the long edge.
        val plan = ThumbHash.sourcePlan(width = 1080, height = 1920)

        assertThat(plan.height).isEqualTo(maxSide)
        // round(1080 * 100 / 1920) = round(56.25) = 56
        assertThat(plan.width).isEqualTo(56)
        assertThat(plan.downscaled).isTrue()
    }

    @Test
    fun `a landscape source caps the width and derives the height by aspect ratio`() {
        val plan = ThumbHash.sourcePlan(width = 1920, height = 1080)

        assertThat(plan.width).isEqualTo(maxSide)
        assertThat(plan.height).isEqualTo(56)
        assertThat(plan.downscaled).isTrue()
    }

    @Test
    fun `the long edge lands exactly on the budget even one pixel over`() {
        val plan = ThumbHash.sourcePlan(width = 101, height = 50)

        assertThat(plan.width).isEqualTo(maxSide)
        // round(50 * 100 / 101) = round(49.5) = 50
        assertThat(plan.height).isEqualTo(50)
        assertThat(plan.downscaled).isTrue()
    }

    // --- extreme ratios: the short edge must never collapse to zero ---------------

    @Test
    fun `an extreme banner ratio clamps the vanishing short edge to one pixel`() {
        // round(3 * 100 / 1000) = round(0.3) = 0 → must clamp to 1, never a zero-side encode input.
        val plan = ThumbHash.sourcePlan(width = 1000, height = 3)

        assertThat(plan.width).isEqualTo(maxSide)
        assertThat(plan.height).isEqualTo(1)
        assertThat(plan.downscaled).isTrue()
    }

    @Test
    fun `an extreme vertical ratio clamps the vanishing short edge to one pixel`() {
        val plan = ThumbHash.sourcePlan(width = 3, height = 1000)

        assertThat(plan.height).isEqualTo(maxSide)
        assertThat(plan.width).isEqualTo(1)
        assertThat(plan.downscaled).isTrue()
    }

    // --- the invariant every write-path depends on --------------------------------

    @Test
    fun `every plan is a legal encode input across a wide range of sources`() {
        val sources = listOf(
            1 to 1, 100 to 100, 101 to 101, 200 to 137, 4000 to 3, 3 to 4000,
            1920 to 1080, 1080 to 1920, 640 to 480, 99 to 101, 100 to 1,
        )

        sources.forEach { (w, h) ->
            val plan = ThumbHash.sourcePlan(width = w, height = h)

            assertThat(plan.width).isIn(1..maxSide)
            assertThat(plan.height).isIn(1..maxSide)
        }
    }

    @Test
    fun `a downscale plan preserves which edge is the longer one`() {
        val portrait = ThumbHash.sourcePlan(width = 300, height = 900)
        assertThat(portrait.height).isGreaterThan(portrait.width)

        val landscape = ThumbHash.sourcePlan(width = 900, height = 300)
        assertThat(landscape.width).isGreaterThan(landscape.height)
    }

    // --- illegal sources ----------------------------------------------------------

    @Test
    fun `a zero-width source is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            ThumbHash.sourcePlan(width = 0, height = 10)
        }
    }

    @Test
    fun `a negative-height source is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            ThumbHash.sourcePlan(width = 10, height = -1)
        }
    }
}
