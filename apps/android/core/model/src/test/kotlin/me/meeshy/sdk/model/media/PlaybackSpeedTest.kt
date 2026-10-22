package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaybackSpeedTest {
    @Test fun `la grille est celle d'iOS`() {
        assertThat(PlaybackSpeed.entries.map { it.rate })
            .containsExactly(0.8f, 0.9f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f, 2.25f).inOrder()
    }

    @Test fun `le defaut est 1x`() {
        assertThat(PlaybackSpeed.DEFAULT.rate).isEqualTo(1.0f)
    }

    @Test fun `le cycle boucle de 2,25 vers 0,8`() {
        assertThat(PlaybackSpeed.X2_25.next()).isEqualTo(PlaybackSpeed.X0_8)
        assertThat(PlaybackSpeed.X1_0.next()).isEqualTo(PlaybackSpeed.X1_25)
    }

    @Test fun `le libelle porte la croix de multiplication`() {
        assertThat(PlaybackSpeed.X1_25.label).isEqualTo("1.25×")
        assertThat(PlaybackSpeed.X1_0.label).isEqualTo("1×")
        assertThat(PlaybackSpeed.X2_0.label).isEqualTo("2×")
    }

    @Test fun `l'ancienne grille 0,5 n'existe plus`() {
        assertThat(PlaybackSpeed.fromRate(0.5f)).isNull()
        assertThat(PlaybackSpeed.fromRate(1.5f)).isEqualTo(PlaybackSpeed.X1_5)
    }
}
