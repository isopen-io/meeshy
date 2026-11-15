package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalFocusDetailsMotionLawTest {

    @Test
    fun `les details ne se posent qu a vitesse de lecture`() {
        assertThat(FocalFocusDetailsMotionLaw.MAX_REVEAL_SPEED).isEqualTo(700.0)
        assertThat(FocalFocusDetailsMotionLaw.revealsDetails(700.0)).isTrue()
        assertThat(FocalFocusDetailsMotionLaw.revealsDetails(-700.0)).isTrue()
        assertThat(FocalFocusDetailsMotionLaw.revealsDetails(701.0)).isFalse()
        assertThat(FocalFocusDetailsMotionLaw.revealsDetails(-1_300.0)).isFalse()
        assertThat(FocalFocusDetailsMotionLaw.MAX_REVEAL_SPEED).isLessThan(FocalMagnificationLaw.HIGH_VELOCITY_THRESHOLD)
    }

    @Test
    fun `le compteur de vitesse derive la vitesse des offsets successifs`() {
        val meter = ScrollSpeedMeter().note(0.0, 0.0).note(50.0, 0.1)
        assertThat(meter.speed).isWithin(1e-9).of(500.0)
        assertThat(meter.note(20.0, 0.2).speed).isWithin(1e-9).of(-300.0)
    }

    @Test
    fun `deux echantillons dans la meme transaction ne font pas une vitesse infinie`() {
        val meter = ScrollSpeedMeter().note(0.0, 0.0).note(50.0, 0.1).note(900.0, 0.1005)
        assertThat(meter.speed).isWithin(1e-9).of(500.0)
    }

    @Test
    fun `le premier echantillon ne donne aucune vitesse et la remise a zero oublie tout`() {
        assertThat(ScrollSpeedMeter().note(10.0, 5.0).speed).isEqualTo(0.0)
        val reset = ScrollSpeedMeter().note(0.0, 0.0).note(50.0, 0.1).reset()
        assertThat(reset.speed).isEqualTo(0.0)
        assertThat(reset.note(999.0, 1.0).speed).isEqualTo(0.0)
    }
}
