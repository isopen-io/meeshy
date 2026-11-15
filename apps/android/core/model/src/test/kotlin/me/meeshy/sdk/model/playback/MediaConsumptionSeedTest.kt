package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyMediaConsumption
import org.junit.Test

class MediaConsumptionSeedTest {

    @Test
    fun `rien de servi ne fabrique aucune consommation`() {
        assertThat(MediaConsumptionSeed.of(lastPlayPositionMs = null, listenedComplete = false)).isNull()
    }

    @Test
    fun `la position servie amorce la reprise`() {
        assertThat(MediaConsumptionSeed.of(lastPlayPositionMs = 4_200, listenedComplete = false))
            .isEqualTo(MeeshyMediaConsumption(lastPlayPositionMs = 4_200))
    }

    @Test
    fun `un vocal ecoute jusqu au bout le reste, position ou non`() {
        assertThat(MediaConsumptionSeed.of(lastPlayPositionMs = null, listenedComplete = true))
            .isEqualTo(MeeshyMediaConsumption(listenedComplete = true))
        assertThat(MediaConsumptionSeed.of(lastPlayPositionMs = 9_000, listenedComplete = true))
            .isEqualTo(MeeshyMediaConsumption(lastPlayPositionMs = 9_000, listenedComplete = true))
    }

    @Test
    fun `une position negative n est pas une position`() {
        assertThat(MediaConsumptionSeed.of(lastPlayPositionMs = -1, listenedComplete = false)).isNull()
    }
}
