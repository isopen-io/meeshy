package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class TimelineGeometryTest {

    @Test
    fun `cinquante pixels par seconde au zoom nominal et aller retour temps x`() {
        val g = TimelineGeometry(1f)
        assertThat(g.pixelsPerSecond).isEqualTo(50f)
        assertThat(g.x(2f)).isEqualTo(100f)
        assertThat(g.time(g.x(3.5f))).isWithin(1e-5f).of(3.5f)
        assertThat(g.width(4f)).isEqualTo(200f)
    }

    @Test
    fun `le zoom est plancher a cinq pour cent`() {
        assertThat(TimelineGeometry(0f).pixelsPerSecond).isEqualTo(2.5f)
        assertThat(TimelineGeometry(-4f).pixelsPerSecond).isEqualTo(2.5f)
    }

    @Test
    fun `un element permanent s etend jusqu a la fin de la slide`() {
        assertThat(TimelineGeometry.effectiveClipDuration(2f, null, 10f)).isEqualTo(8f)
        assertThat(TimelineGeometry.effectiveClipDuration(2f, 0f, 10f)).isEqualTo(8f)
        assertThat(TimelineGeometry.effectiveClipDuration(12f, null, 10f)).isEqualTo(0f)
        assertThat(TimelineGeometry.effectiveClipDuration(2f, 3f, 10f)).isEqualTo(3f)
    }
}
