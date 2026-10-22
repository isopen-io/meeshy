package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaybackQuartilesTest {

    @Test
    fun `le bitmask est 1 2 4 8 aux seuils 25 50 75 100`() {
        assertThat(PlaybackQuartiles.mask(0, 1_000)).isEqualTo(0)
        assertThat(PlaybackQuartiles.mask(249, 1_000)).isEqualTo(0)
        assertThat(PlaybackQuartiles.mask(250, 1_000)).isEqualTo(1)
        assertThat(PlaybackQuartiles.mask(500, 1_000)).isEqualTo(3)
        assertThat(PlaybackQuartiles.mask(750, 1_000)).isEqualTo(7)
        assertThat(PlaybackQuartiles.mask(1_000, 1_000)).isEqualTo(15)
    }

    @Test
    fun `le bitmask est monotone en position`() {
        val masks = (0..1_000 step 10).map { PlaybackQuartiles.mask(it, 1_000) }
        assertThat(masks).isInOrder()
    }

    @Test
    fun `une duree inconnue ne produit aucun quartile`() {
        assertThat(PlaybackQuartiles.mask(5_000, 0)).isEqualTo(0)
    }
}
