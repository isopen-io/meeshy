package me.meeshy.sdk.model.mood

import com.google.common.truth.Truth.assertThat
import kotlin.random.Random
import org.junit.Test

class MoodEmojiRainStateTest {

    @Test fun `le meme generateur injecte rejoue exactement la meme pluie`() {
        fun run(): MoodEmojiRainState {
            val random = Random(42)
            var state = MoodEmojiRainState()
            var t = 0.0
            repeat(20) { state = state.advanced(t, random); t += 0.4 }
            return state
        }
        assertThat(run()).isEqualTo(run())
    }

    @Test fun `la vie d une particule reste entre 3 et 4,6 secondes`() {
        val random = Random(7)
        repeat(50) {
            val life = MoodEmojiRain.makeParticle(it, 0.0, random).lifetime
            assertThat(life).isAtLeast(3.0)
            assertThat(life).isAtMost(4.6)
        }
    }

    @Test fun `une particule detruite a la fin de sa vie ne reapparait pas`() {
        val random = Random(5)
        val first = MoodEmojiRainState().advanced(0.0, random)
        val id = first.particles.single().id
        val later = first.advanced(10.0, random)
        assertThat(later.particles.map { it.id }).doesNotContain(id)
    }

    @Test fun `une particule est entierement transparente a la moitie de la largeur`() {
        val width = 400f
        val half = MoodEmojiRain.size(1.0, width)
        assertThat(half).isEqualTo(width * 0.5f)
        assertThat(MoodEmojiRain.opacity(half, width)).isEqualTo(0f)
    }
}
