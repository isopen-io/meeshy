package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #19701 — une seule vignette, qui glisse avec élan puis se pose au bord le plus proche. */
class CallVignetteGlideTest {
    private val bounds = CallVignetteGlide.Bounds(minX = 36f, maxX = 800f, minY = 36f, maxY = 1500f)

    @Test
    fun `released slowly, it lands at the nearest edge where the finger left it`() {
        val landing = CallVignetteGlide.landing(700f, 500f, 0f, 0f, bounds, maxGlide = 960f)
        assertThat(landing).isEqualTo(CallVignetteGlide.Landing(800f, 500f))
    }

    @Test
    fun `flung toward the other edge, its momentum carries it there`() {
        assertThat(CallVignetteGlide.landing(600f, 500f, 0f, 0f, bounds, 960f).x).isEqualTo(800f)
        assertThat(CallVignetteGlide.landing(600f, 500f, -2_000f, 0f, bounds, 960f).x).isEqualTo(36f)
    }

    @Test
    fun `a violent fling is bounded on each axis`() {
        assertThat(CallVignetteGlide.glide(100f, 100_000f, 960f)).isEqualTo(1_060f)
        assertThat(CallVignetteGlide.glide(100f, -100_000f, 960f)).isEqualTo(-860f)
    }

    @Test
    fun `it never lands off screen vertically`() {
        assertThat(CallVignetteGlide.landing(700f, 1_400f, 0f, 9_000f, bounds, 960f).y).isEqualTo(1_500f)
        assertThat(CallVignetteGlide.landing(700f, 50f, 0f, -9_000f, bounds, 960f).y).isEqualTo(36f)
    }

    @Test
    fun `a pill swiped far enough either way collapses into the vignette`() {
        assertThat(CallVignetteGlide.collapses(79f)).isFalse()
        assertThat(CallVignetteGlide.collapses(80f)).isTrue()
        assertThat(CallVignetteGlide.collapses(-120f)).isTrue()
    }
}
