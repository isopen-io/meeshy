package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La règle des 6 s en BOUCLES ENTIÈRES (iOS `StoryDurationPolicy`) : jamais une boucle coupée en son milieu. */
class StorySlideDurationLoopEdgeTest {

    private fun loopedVideo(period: Double) =
        StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "v", isBackground = true, mediaType = "video", duration = period)))

    private fun seconds(period: Double) = StorySlideDuration.computeSeconds(loopedVideo(period))

    @Test
    fun `une periode qui divise six tombe pile sur six secondes`() {
        assertThat(seconds(3.0)).isWithin(1e-9).of(6.0)
        assertThat(seconds(1.5)).isWithin(1e-9).of(6.0)
    }

    @Test
    fun `une periode qui ne divise pas six depasse jusqu a la boucle entiere suivante`() {
        assertThat(seconds(2.5)).isWithin(1e-9).of(7.5)
        assertThat(seconds(5.999)).isWithin(1e-9).of(11.998)
    }

    @Test
    fun `une periode egale ou superieure a six est jouee une seule fois entiere`() {
        assertThat(seconds(6.0)).isWithin(1e-9).of(6.0)
        assertThat(seconds(6.001)).isWithin(1e-9).of(6.001)
    }

    @Test
    fun `la duree est toujours un multiple entier de la periode`() {
        listOf(0.7, 1.3, 2.9, 4.4, 5.5).forEach { period ->
            val loops = seconds(period) / period
            assertThat(loops).isWithin(1e-6).of(Math.round(loops).toDouble())
            assertThat(seconds(period)).isAtLeast(6.0)
        }
    }

    @Test
    fun `un long texte releve la cible et la boucle s y aligne`() {
        val words = (1..36).joinToString(" ") { "mot$it" }
        val effects = loopedVideo(4.0).copy(textObjects = listOf(StoryTextObject(id = "t", text = words)))
        // 36 mots -> cible 7 s ; période 4 s -> deux boucles = 8 s.
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(8.0)
    }
}
