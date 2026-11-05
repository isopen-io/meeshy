package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryProgressScrubTest {

    @Test
    fun `poser le doigt commence le glissé et pointe une fraction`() {
        val state = StoryProgressScrubState()
        assertThat(state.track(x = 50f, width = 200f)).isTrue()
        assertThat(state.fraction).isEqualTo(0.25f)
        assertThat(state.isScrubbing).isTrue()
    }

    @Test
    fun `le glissé suivant ne recommence pas le geste`() {
        val state = StoryProgressScrubState()
        state.track(10f, 200f)
        assertThat(state.track(150f, 200f)).isFalse()
        assertThat(state.fraction).isEqualTo(0.75f)
    }

    @Test
    fun `la fraction est bornée aux bords de la barre`() {
        val state = StoryProgressScrubState()
        state.track(-30f, 200f)
        assertThat(state.fraction).isEqualTo(0f)
        state.track(900f, 200f)
        assertThat(state.fraction).isEqualTo(1f)
    }

    @Test
    fun `une largeur nulle pointe le début`() {
        val state = StoryProgressScrubState()
        state.track(10f, 0f)
        assertThat(state.fraction).isEqualTo(0f)
    }

    @Test
    fun `le relâcher rend la fraction choisie et remet la barre au repos`() {
        val state = StoryProgressScrubState()
        state.track(100f, 200f)
        assertThat(state.finish()).isEqualTo(0.5f)
        assertThat(state.isScrubbing).isFalse()
        assertThat(state.finish()).isNull()
    }

    @Test
    fun `la barre montre le doigt pendant le glissé et la lecture au repos`() {
        val state = StoryProgressScrubState()
        assertThat(state.displayed(playback = 0.3f)).isEqualTo(0.3f)
        state.track(100f, 200f)
        assertThat(state.displayed(playback = 0.3f)).isEqualTo(0.5f)
    }

    @Test
    fun `le réglage d'accessibilité enchaîne les trois temps du geste`() {
        val calls = mutableListOf<String>()
        val scrubber = StoryProgressScrubber(
            fraction = { 0f },
            begin = { calls += "begin" },
            moveTo = { calls += "move $it" },
            end = { calls += "end $it" },
        )
        scrubber.adjust(0.6f)
        assertThat(calls).containsExactly("begin", "move 0.6", "end 0.6").inOrder()
    }
}
