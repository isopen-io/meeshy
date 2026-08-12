package me.meeshy.ui.component.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [SplashLogoGeometry] — the pure bar geometry + stagger math driving
 * the animated "stacked-dashes" brand mark on [MeeshySplashScreen] (the Compose analogue of
 * iOS `AnimatedLogoView`'s staggered dash reveal).
 */
class SplashLogoGeometryTest {

    private val tol = 1e-4f

    @Test
    fun `there are exactly three bars, decreasing width, left-aligned`() {
        val bars = SplashLogoGeometry.bars
        assertThat(bars).hasSize(3)
        assertThat(bars.map { it.left }.toSet()).hasSize(1) // left-aligned: same left edge
        assertThat(bars[0].width).isGreaterThan(bars[1].width)
        assertThat(bars[1].width).isGreaterThan(bars[2].width)
    }

    @Test
    fun `every bar stays within the normalized 0f to 1f viewport`() {
        SplashLogoGeometry.bars.forEach { bar ->
            assertThat(bar.left).isAtLeast(0f)
            assertThat(bar.top).isAtLeast(0f)
            assertThat(bar.right).isAtMost(1f)
            assertThat(bar.bottom).isAtMost(1f)
            assertThat(bar.right).isGreaterThan(bar.left)
            assertThat(bar.bottom).isGreaterThan(bar.top)
        }
    }

    @Test
    fun `bars are stacked top to bottom without overlap`() {
        val bars = SplashLogoGeometry.bars
        assertThat(bars[0].bottom).isLessThan(bars[1].top)
        assertThat(bars[1].bottom).isLessThan(bars[2].top)
    }

    @Test
    fun `all bars share the same height`() {
        val heights = SplashLogoGeometry.bars.map { it.height }
        assertThat(heights[0]).isWithin(tol).of(heights[1])
        assertThat(heights[1]).isWithin(tol).of(heights[2])
    }

    @Test
    fun `at global progress zero every bar is fully hidden`() {
        repeat(3) { index ->
            assertThat(SplashLogoGeometry.barProgress(0f, index)).isWithin(tol).of(0f)
        }
    }

    @Test
    fun `at global progress one every bar lands fully revealed regardless of stagger`() {
        repeat(3) { index ->
            assertThat(SplashLogoGeometry.barProgress(1f, index)).isWithin(tol).of(1f)
        }
    }

    @Test
    fun `a bar stays hidden until global progress reaches its own start offset`() {
        // Bar 2 (third bar) starts later than bar 0 — at a progress past bar 0's
        // completion but before bar 2's start, bar 0 is ahead of bar 2.
        val early = 0.1f
        assertThat(SplashLogoGeometry.barProgress(early, 0)).isGreaterThan(0f)
        assertThat(SplashLogoGeometry.barProgress(early, 2)).isWithin(tol).of(0f)
    }

    @Test
    fun `progress is monotonically non-decreasing as global progress advances`() {
        repeat(3) { index ->
            val samples = listOf(0f, 0.2f, 0.4f, 0.6f, 0.8f, 1f)
            val progressed = samples.map { SplashLogoGeometry.barProgress(it, index) }
            progressed.zipWithNext().forEach { (a, b) -> assertThat(b).isAtLeast(a) }
        }
    }

    @Test
    fun `progress never leaves the zero to one range even past the animation bounds`() {
        repeat(3) { index ->
            assertThat(SplashLogoGeometry.barProgress(-0.5f, index)).isWithin(tol).of(0f)
            assertThat(SplashLogoGeometry.barProgress(1.5f, index)).isWithin(tol).of(1f)
        }
    }

    @Test
    fun `the first bar has no stagger — it starts revealing immediately`() {
        assertThat(SplashLogoGeometry.barProgress(0.01f, 0)).isGreaterThan(0f)
    }
}
