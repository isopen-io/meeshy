package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Une durée publiée par un tiers ne peut pas retenir le lecteur : la slide s'avance toujours. */
class StorySlideDurationHostileTest {

    private fun pinned(seconds: Double) = StoryEffects(timelineDuration = seconds)

    @Test
    fun `une durée épinglée démesurée est plafonnée au maximum du composeur`() {
        assertThat(StorySlideDuration.computeSeconds(pinned(1e308))).isEqualTo(StoryDurationPin.MAX_SECONDS)
        assertThat(StorySlideDuration.computeSeconds(pinned(Double.POSITIVE_INFINITY))).isEqualTo(StoryDurationPin.MAX_SECONDS)
        assertThat(StorySlideDuration.computeMillis(pinned(1e308))).isEqualTo(600_000)
    }

    @Test
    fun `une durée épinglée NaN retombe sur le contenu`() {
        assertThat(StorySlideDuration.computeSeconds(pinned(Double.NaN))).isEqualTo(StorySlideDuration.DEFAULT_STATIC_SECONDS)
    }

    @Test
    fun `une durée épinglée légitime reste intacte`() {
        assertThat(StorySlideDuration.computeSeconds(pinned(45.5))).isEqualTo(45.5)
        assertThat(StorySlideDuration.computeSeconds(pinned(600.0))).isEqualTo(600.0)
    }

    @Test
    fun `une durée de média démesurée ne retient pas la slide au-delà du plafond de la passerelle`() {
        val effects = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "m", mediaType = "image", duration = 1e308)))
        assertThat(StorySlideDuration.computeSeconds(effects)).isEqualTo(StorySlideDuration.MAX_CONTENT_SECONDS)
    }

    @Test
    fun `une durée de média infinie ou NaN est ignorée`() {
        val infinite = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "m", mediaType = "video", isBackground = true, duration = Double.POSITIVE_INFINITY)))
        val nan = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "m", mediaType = "video", isBackground = true, duration = Double.NaN)))
        assertThat(StorySlideDuration.computeSeconds(infinite)).isAtMost(StorySlideDuration.MAX_CONTENT_SECONDS)
        assertThat(StorySlideDuration.computeSeconds(nan)).isEqualTo(StorySlideDuration.DEFAULT_STATIC_SECONDS)
    }
}
