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
    fun `the lines are the five iOS snap targets on each axis`() {
        val g = StorySafeZoneGrid.geometry(1000f, 2000f)

        assertThat(g.verticalLines).hasSize(5)
        listOf(180f, 250f, 500f, 750f, 820f).forEachIndexed { i, x -> assertThat(g.verticalLines[i]).isWithin(tol).of(x) }
        listOf(360f, 500f, 1000f, 1500f, 1640f).forEachIndexed { i, y -> assertThat(g.horizontalLines[i]).isWithin(tol).of(y) }
    }

    @Test
    fun `the old rule-of-thirds lines are not drawn`() {
        val g = StorySafeZoneGrid.geometry(900f, 1800f)

        assertThat(g.verticalLines).doesNotContain(300f)
        assertThat(g.verticalLines).doesNotContain(600f)
        assertThat(g.horizontalLines).doesNotContain(600f)
        assertThat(g.horizontalLines).doesNotContain(1200f)
    }

    // --- degenerate guards (draw nothing) ---

    @Test
    fun `a zero width canvas yields an empty geometry`() {
        val g = StorySafeZoneGrid.geometry(0f, 1920f)

        assertThat(g.isEmpty).isTrue()
        assertThat(g.verticalLines).isEmpty()
        assertThat(g.horizontalLines).isEmpty()
    }

    @Test
    fun `a zero height canvas yields an empty geometry`() {
        val g = StorySafeZoneGrid.geometry(1080f, 0f)

        assertThat(g.isEmpty).isTrue()
        assertThat(g.verticalLines).isEmpty()
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
