package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StrokeCapturePressureTest {

    private fun line(count: Int, stepPx: Double, stepMs: Long, force: (Int) -> Double = { 1.0 }) =
        (0 until count).map { StrokeCaptureSample(it * stepPx, 0.0, it * stepMs, force(it)) }

    @Test
    fun `a stylus whose force varies drives the width by its force`() {
        val samples = line(4, 10.0, 16) { listOf(0.2, 0.5, 1.0, 0.4)[it] }

        val points = StrokeCapture.points(samples, 1080.0, 1920.0, isStylus = true)

        assertThat(points.map { it.pressure }).containsExactly(0.2, 0.5, 1.0, 0.4).inOrder()
    }

    @Test
    fun `a slow finger draws thicker than a fast one`() {
        val slow = StrokeCapture.points(line(8, 1.0, 16), 1080.0, 1920.0, isStylus = false)
        val fast = StrokeCapture.points(line(8, 80.0, 16), 1080.0, 1920.0, isStylus = false)

        assertThat(slow.last().pressure).isGreaterThan(fast.last().pressure)
    }

    @Test
    fun `a stylus of constant force falls back to the finger speed driver`() {
        val samples = line(8, 80.0, 16)

        val stylus = StrokeCapture.points(samples, 1080.0, 1920.0, isStylus = true)

        assertThat(stylus.last().pressure).isLessThan(0.9)
    }

    @Test
    fun `points are projected non uniformly to the design space`() {
        val points = StrokeCapture.points(
            listOf(StrokeCaptureSample(270.0, 480.0, 0)), 540.0, 960.0, isStylus = false,
        )

        assertThat(points.single().x).isWithin(1e-9).of(540.0)
        assertThat(points.single().y).isWithin(1e-9).of(960.0)
    }

    @Test
    fun `an unmeasured surface or no sample yields nothing`() {
        assertThat(StrokeCapture.points(emptyList(), 100.0, 100.0, false)).isEmpty()
        assertThat(StrokeCapture.points(line(2, 1.0, 1), 0.0, 100.0, false)).isEmpty()
    }

    @Test
    fun `capture version one marks pressure driven strokes`() {
        assertThat(StrokeCapture.CAPTURE_VERSION).isEqualTo(1)
    }

}
