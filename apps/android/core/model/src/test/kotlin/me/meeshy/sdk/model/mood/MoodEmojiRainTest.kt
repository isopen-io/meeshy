package me.meeshy.sdk.model.mood

import com.google.common.truth.Truth.assertThat
import kotlin.random.Random
import org.junit.Test

class MoodEmojiRainTest {

    private val width = 400f

    @Test fun `la premiere image fait naitre une particule`() {
        val state = MoodEmojiRainState().advanced(0.0, Random(1))
        assertThat(state.particles).hasSize(1)
    }

    @Test fun `la cadence limite les naissances`() {
        val random = Random(2)
        val state = MoodEmojiRainState().advanced(0.0, random).advanced(0.1, random)
        assertThat(state.particles).hasSize(1)
        assertThat(state.advanced(0.5, random).particles).hasSize(2)
    }

    @Test fun `le plafond n est jamais depasse`() {
        val random = Random(3)
        var state = MoodEmojiRainState()
        var t = 0.0
        repeat(200) { state = state.advanced(t, random); t += 0.4 }
        assertThat(state.particles.size).isAtMost(MoodEmojiRain.MAX_PARTICLES)
    }

    @Test fun `une particule au bout de sa vie est retiree`() {
        val random = Random(4)
        val born = MoodEmojiRainState().advanced(0.0, random)
        val later = born.advanced(MoodEmojiRain.MAX_LIFETIME + 1.0, random)
        assertThat(later.particles.none { it.id == 0 }).isTrue()
    }

    @Test fun `la taille grandit et l opacite tombe a zero a la moitie de la largeur`() {
        val particle = MoodEmojiRain.makeParticle(0, 0.0, Random(5))
        val atBirth = MoodEmojiRain.frame(particle, 0.0, width, 800f)
        val atEnd = MoodEmojiRain.frame(particle, particle.lifetime, width, 800f)
        assertThat(atBirth.size).isEqualTo(MoodEmojiRain.BIRTH_SIZE)
        assertThat(atBirth.opacity).isEqualTo(1f)
        assertThat(atEnd.size).isWithin(0.01f).of(width / 2)
        assertThat(atEnd.opacity).isEqualTo(0f)
    }

    @Test fun `la largeur minuscule garde une taille plancher et une opacite nulle`() {
        assertThat(MoodEmojiRain.vanishingSize(10f)).isEqualTo(MoodEmojiRain.BIRTH_SIZE)
        assertThat(MoodEmojiRain.opacity(30f, 10f)).isEqualTo(0f)
    }
}
