package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioTrimGeometryTest {

    private fun geometry(duration: Double = 60.0, width: Float = 300f, zoom: Float = 1f) =
        AudioTrimGeometry(duration, width, zoom)

    @Test
    fun `x et temps sont réciproques`() {
        val g = geometry(zoom = 4f)
        val x = g.x(12.5, offset = 100f)
        assertThat(g.time(x, offset = 100f)).isWithin(1e-4).of(12.5)
    }

    @Test
    fun `l'offset est borné à zéro et largeur contenu moins largeur visible`() {
        val g = geometry(zoom = 4f)
        assertThat(g.maximumOffset).isEqualTo(900f)
        assertThat(g.clampedOffset(-10f)).isEqualTo(0f)
        assertThat(g.clampedOffset(5000f)).isEqualTo(900f)
        assertThat(geometry(zoom = 1f).maximumOffset).isEqualTo(0f)
    }

    @Test
    fun `le zoom est borné de 1 à 40`() {
        assertThat(geometry(zoom = 0.2f).zoom).isEqualTo(1f)
        assertThat(geometry(zoom = 500f).zoom).isEqualTo(40f)
    }

    @Test
    fun `durée et largeur nulles ne produisent jamais de division par zéro`() {
        val g = AudioTrimGeometry(0.0, 0f, 1f)
        assertThat(g.pointsPerSecond.isFinite()).isTrue()
        assertThat(g.time(10f, 0f).isFinite()).isTrue()
    }

    @Test
    fun `le zoom garde l'instant centré`() {
        val g = geometry(zoom = 2f)
        val offset = g.offsetCentering(30.0)
        val (zoomed, newOffset) = g.zoomed(to = 10f, offset = offset)
        assertThat(zoomed.zoom).isEqualTo(10f)
        assertThat(zoomed.time(zoomed.width / 2f, newOffset)).isWithin(1e-3).of(30.0)
    }

    @Test
    fun `une poignée ne traverse jamais l'autre`() {
        val g = geometry()
        assertThat(g.movedStart(to = 50.0, end = 10.0)).isWithin(1e-9).of(9.75)
        assertThat(g.movedStart(to = -3.0, end = 10.0)).isEqualTo(0.0)
        assertThat(g.movedEnd(to = 1.0, start = 5.0)).isWithin(1e-9).of(5.25)
        assertThat(g.movedEnd(to = 99.0, start = 5.0)).isEqualTo(60.0)
    }

    @Test
    fun `clampedRange impose le segment minimal et l'ordre`() {
        val g = geometry()
        val r = g.clampedRange(-5.0..-4.0)
        assertThat(r.start).isEqualTo(0.0)
        assertThat(r.endInclusive).isEqualTo(0.25)
        val tail = g.clampedRange(70.0..80.0)
        assertThat(tail.start).isWithin(1e-9).of(59.75)
        assertThat(tail.endInclusive).isEqualTo(60.0)
    }

    @Test
    fun `une piste plus courte que le minimum garde sa durée entière`() {
        assertThat(geometry(duration = 0.1).clampedRange(0.0..0.05)).isEqualTo(0.0..0.1)
    }
}
