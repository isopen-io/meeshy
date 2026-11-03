package me.meeshy.ui.story.canvas

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScenePlaybackCoordinatorTest {

    private fun coordinator() = ScenePlaybackCoordinator()

    @Test
    fun `un canvas qui reclame la lecture preempte le precedent`() {
        val c = coordinator()
        c.claim("a")
        c.claim("b")
        assertThat(c.shouldPlay("a")).isFalse()
        assertThat(c.shouldPlay("b")).isTrue()
    }

    @Test
    fun `un canvas evince coupe immediatement et un canvas inconnu ne joue pas`() {
        val c = coordinator()
        c.claim("a")
        c.preempt("a")
        assertThat(c.shouldPlay("a")).isFalse()
        assertThat(c.shouldPlay("zzz")).isFalse()
    }

    @Test
    fun `un canvas mis en pause qui revient a l'ecran garde sa pause`() {
        val c = coordinator()
        c.claim("a")
        c.setPaused("a", true)
        c.preempt("a")
        c.claim("a")
        assertThat(c.shouldPlay("a")).isFalse()
        c.setPaused("a", false)
        assertThat(c.shouldPlay("a")).isTrue()
    }

    @Test
    fun `liberer un canvas oublie sa pause`() {
        val c = coordinator()
        c.claim("a")
        c.setPaused("a", true)
        c.release("a")
        c.claim("a")
        assertThat(c.shouldPlay("a")).isTrue()
    }

    @Test
    fun `l'arriere-plan fige la lecture et le retour reprend sans perdre les pauses`() {
        val c = coordinator()
        c.claim("a")
        c.setInBackground(true)
        assertThat(c.shouldPlay("a")).isFalse()
        c.setInBackground(false)
        assertThat(c.shouldPlay("a")).isTrue()
        c.setPaused("a", true)
        c.setInBackground(true)
        c.setInBackground(false)
        assertThat(c.shouldPlay("a")).isFalse()
    }

    @Test
    fun `le verrou de mute l'emporte sur le mute global`() {
        val c = coordinator()
        assertThat(c.state.value.effectiveMuted).isFalse()
        c.setMuteLocked(true)
        c.setMuted(false)
        assertThat(c.state.value.effectiveMuted).isTrue()
        c.setMuteLocked(false)
        c.setMuted(true)
        assertThat(c.state.value.effectiveMuted).isTrue()
    }
}
