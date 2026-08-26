package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure safe-zone / rule-of-thirds grid geometry. This resolver
 * owns the persistent overlay the composer draws while an element is being dragged — the
 * viewer-chrome safe rectangle (parity with iOS `StorySafeZone`, asymmetric top/bottom
 * insets) plus the classic rule-of-thirds lines — so the canvas Composable stays glue.
 * No Android, no Compose, no I/O.
 */
@RunWith(JUnit4::class)
class StorySafeZoneGridTest {

    private val tol = 1e-3f

    // --- nominal geometry ---

    @Test
    fun `on a unit canvas the safe rect equals the normalised iOS insets`() {
        val g = StorySafeZoneGrid.geometry(1f, 1f)

        assertThat(g.isEmpty).isFalse()
        assertThat(g.safeLeft).isWithin(tol).of(0.05f)
        assertThat(g.safeTop).isWithin(tol).of(0.18f)
        assertThat(g.safeRight).isWithin(tol).of(0.95f)
        assertThat(g.safeBottom).isWithin(tol).of(0.75f)
    }

    @Test
    fun `the safe rect denormalises each axis independently`() {
        val g = StorySafeZoneGrid.geometry(1080f, 1920f)

        assertThat(g.safeLeft).isWithin(0.5f).of(0.05f * 1080f)
        assertThat(g.safeTop).isWithin(0.5f).of(0.18f * 1920f)
        assertThat(g.safeRight).isWithin(0.5f).of(0.95f * 1080f)
        assertThat(g.safeBottom).isWithin(0.5f).of(0.75f * 1920f)
    }

    @Test
    fun `the grid draws the two rule-of-thirds lines on each axis`() {
        val g = StorySafeZoneGrid.geometry(900f, 1800f)

        assertThat(g.verticalThirds).hasSize(2)
        assertThat(g.verticalThirds[0]).isWithin(tol).of(300f)
        assertThat(g.verticalThirds[1]).isWithin(tol).of(600f)

        assertThat(g.horizontalThirds).hasSize(2)
        assertThat(g.horizontalThirds[0]).isWithin(tol).of(600f)
        assertThat(g.horizontalThirds[1]).isWithin(tol).of(1200f)
    }

    @Test
    fun `the thirds lines omit the centre line so it is left to the transient snap guide`() {
        val g = StorySafeZoneGrid.geometry(1000f, 1000f)

        // centre (500f on a 1000px axis) must NOT appear among the persistent grid lines.
        assertThat(g.verticalThirds).doesNotContain(500f)
        assertThat(g.horizontalThirds).doesNotContain(500f)
    }

    // --- degenerate guards (draw nothing) ---

    @Test
    fun `a zero width canvas yields an empty geometry`() {
        val g = StorySafeZoneGrid.geometry(0f, 1920f)

        assertThat(g.isEmpty).isTrue()
        assertThat(g.verticalThirds).isEmpty()
        assertThat(g.horizontalThirds).isEmpty()
    }

    @Test
    fun `a zero height canvas yields an empty geometry`() {
        val g = StorySafeZoneGrid.geometry(1080f, 0f)

        assertThat(g.isEmpty).isTrue()
        assertThat(g.verticalThirds).isEmpty()
    }

    @Test
    fun `a negative dimension yields an empty geometry`() {
        assertThat(StorySafeZoneGrid.geometry(-10f, 100f).isEmpty).isTrue()
        assertThat(StorySafeZoneGrid.geometry(100f, -10f).isEmpty).isTrue()
    }

    @Test
    fun `a non-finite width yields an empty geometry`() {
        assertThat(StorySafeZoneGrid.geometry(Float.NaN, 100f).isEmpty).isTrue()
        assertThat(StorySafeZoneGrid.geometry(Float.POSITIVE_INFINITY, 100f).isEmpty).isTrue()
    }

    @Test
    fun `a non-finite height yields an empty geometry`() {
        assertThat(StorySafeZoneGrid.geometry(100f, Float.NaN).isEmpty).isTrue()
        assertThat(StorySafeZoneGrid.geometry(100f, Float.NEGATIVE_INFINITY).isEmpty).isTrue()
    }
}
