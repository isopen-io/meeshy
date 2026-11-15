package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneAudioFocusTest {

    @Test
    fun `a transient loss holds the sound and the return resumes it`() {
        val focus = SceneAudioFocusLaw()
        assertThat(focus.onFocusLost()).isTrue()
        assertThat(focus.isHeld).isTrue()
        assertThat(focus.onFocusGained()).isTrue()
        assertThat(focus.isHeld).isFalse()
    }

    @Test
    fun `a loss for good stays paused even when the focus comes back`() {
        val focus = SceneAudioFocusLaw()
        focus.onFocusLost()
        focus.onFocusLostForGood()
        assertThat(focus.onFocusGained()).isFalse()
        assertThat(focus.isHeld).isTrue()
        focus.onUserResume()
        assertThat(focus.isHeld).isFalse()
    }

    @Test
    fun `unplugged headphones pause without resuming by themselves`() {
        val focus = SceneAudioFocusLaw()
        assertThat(focus.onBecomingNoisy()).isTrue()
        assertThat(focus.onFocusGained()).isFalse()
        assertThat(focus.isHeld).isTrue()
    }

    @Test
    fun `a gain without a loss resumes nothing`() {
        assertThat(SceneAudioFocusLaw().onFocusGained()).isFalse()
    }

    @Test
    fun `a second loss does not announce a new hold`() {
        val focus = SceneAudioFocusLaw()
        focus.onFocusLost()
        assertThat(focus.onFocusLost()).isFalse()
    }
}
