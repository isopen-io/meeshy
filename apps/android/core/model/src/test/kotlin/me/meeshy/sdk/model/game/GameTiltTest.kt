package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameTiltTest {

    @Test
    fun `le roulis se ramene en tours`() {
        assertThat(GamePrismTilt.turns(fromRoll = 0.0)).isEqualTo(0.0)
        assertThat(GamePrismTilt.turns(fromRoll = Math.PI / 2)).isWithin(1e-9).of(0.25)
    }

    @Test
    fun `les tours sont bornes a plus ou moins un demi`() {
        assertThat(GamePrismTilt.turns(fromRoll = 100.0)).isEqualTo(0.5)
        assertThat(GamePrismTilt.turns(fromRoll = -100.0)).isEqualTo(-0.5)
    }

    @Test
    fun `l'intensite n'existe que pour une irisation active`() {
        assertThat(GamePrismTilt.intensity(active = true)).isEqualTo(0.6)
        assertThat(GamePrismTilt.intensity(active = false)).isEqualTo(0.0)
    }

    @Test
    fun `le capteur ne tourne que visible actif et en mouvement`() {
        assertThat(GamePrismTilt.sensorRuns(active = true, visible = true, reduceMotion = false)).isTrue()
        assertThat(GamePrismTilt.sensorRuns(active = false, visible = true, reduceMotion = false)).isFalse()
        assertThat(GamePrismTilt.sensorRuns(active = true, visible = false, reduceMotion = false)).isFalse()
        assertThat(GamePrismTilt.sensorRuns(active = true, visible = true, reduceMotion = true)).isFalse()
    }

    @Test
    fun `le capteur echantillonne a 30 Hz`() {
        assertThat(GamePrismTilt.SENSOR_INTERVAL_MICROS).isEqualTo(33_333)
    }
}
