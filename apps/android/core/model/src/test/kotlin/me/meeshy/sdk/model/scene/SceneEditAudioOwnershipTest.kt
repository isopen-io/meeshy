package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneEditAudioOwnershipTest {

    private fun stack(vararg ids: String) = SceneEditAudioOwnership<String>().also { s -> ids.forEach(s::claim) }

    @Test
    fun `the last claimant owns the sound`() {
        val s = stack("scene", "editor")
        assertThat(s.owner).isEqualTo("editor")
        assertThat(s.mayPlay("scene")).isFalse()
        assertThat(s.mayPlay("editor")).isTrue()
    }

    @Test
    fun `nobody owning means anybody may play`() {
        assertThat(SceneEditAudioOwnership<String>().mayPlay("x")).isTrue()
    }

    @Test
    fun `closing the editor hands the sound back to the scene`() {
        val s = stack("scene", "editor")
        assertThat(s.release("editor")).isEqualTo("scene")
        assertThat(s.owner).isEqualTo("scene")
    }

    @Test
    fun `releasing a non owner wakes nobody`() {
        val s = stack("scene", "editor")
        assertThat(s.release("scene")).isNull()
        assertThat(s.owner).isEqualTo("editor")
    }

    @Test
    fun `claiming again moves a canvas back to the top`() {
        val s = stack("a", "b")
        s.claim("a")
        assertThat(s.owner).isEqualTo("a")
    }

    @Test
    fun `a dead canvas never keeps the hand`() {
        val s = stack("scene", "editor")
        s.prune(setOf("scene"))
        assertThat(s.owner).isEqualTo("scene")
    }

    @Test
    fun `the new owner enters at the phase the old one was playing`() {
        val phase = SceneEditAudioPhase("s1", originMs = 1_000)
        assertThat(SceneEditAudioClock.slideElapsedSeconds(phase, "s1", nowMs = 4_500, fallbackElapsed = 0.0)).isEqualTo(3.5)
    }

    @Test
    fun `a phase of another slide or from the future is ignored`() {
        val phase = SceneEditAudioPhase("s1", originMs = 9_000)
        assertThat(SceneEditAudioClock.slideElapsedSeconds(phase, "s2", 10_000, 1.0)).isEqualTo(1.0)
        assertThat(SceneEditAudioClock.slideElapsedSeconds(phase, "s1", 5_000, 2.0)).isEqualTo(2.0)
        assertThat(SceneEditAudioClock.slideElapsedSeconds(null, "s1", 5_000, 3.0)).isEqualTo(3.0)
    }
}
