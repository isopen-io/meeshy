package me.meeshy.sdk.model.brand

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RevealGeometryTest {

    @Test
    fun `the circle radius is the diagonal times the progress`() {
        assertThat(RevealGeometry.circleRadius(300f, 400f, 1f)).isWithin(1e-3f).of(500f)
        assertThat(RevealGeometry.circleRadius(300f, 400f, 0.5f)).isWithin(1e-3f).of(250f)
        assertThat(RevealGeometry.circleRadius(300f, 400f, 0f)).isEqualTo(0f)
    }

    @Test
    fun `the liquid disc starts at its base radius and covers the farthest corner at the end`() {
        val start = RevealGeometry.liquidBareRadius(0f, 0f, 300f, 400f, 0f, 26f, 14f)
        val end = RevealGeometry.liquidBareRadius(0f, 0f, 300f, 400f, 1f, 26f, 14f)
        assertThat(start).isEqualTo(26f)
        assertThat(end).isWithin(1e-3f).of(500f + 14f + 2f)
    }

    @Test
    fun `the wave only lives during the expansion`() {
        assertThat(RevealGeometry.liquidWaveAmplitude(0f, 14f)).isWithin(1e-4f).of(0f)
        assertThat(RevealGeometry.liquidWaveAmplitude(1f, 14f)).isWithin(1e-4f).of(0f)
        assertThat(RevealGeometry.liquidWaveAmplitude(0.5f, 14f)).isWithin(1e-4f).of(14f)
    }

    @Test
    fun `the farthest corner is measured from the focus`() {
        assertThat(RevealGeometry.farthestCorner(150f, 200f, 300f, 400f)).isWithin(1e-3f).of(250f)
    }
}
