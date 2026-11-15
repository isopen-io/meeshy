package me.meeshy.ui.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FrameVisibilityTest {

    private fun decide(
        animates: Boolean = true,
        reduceMotion: Boolean = false,
        powerSaver: Boolean = false,
        onScreen: Boolean = true,
        appForeground: Boolean = true,
    ) = FrameVisibility.decide(animates, reduceMotion, powerSaver, onScreen, appForeground)

    @Test
    fun `a l'ecran au premier plan le mouvement tourne`() {
        assertThat(decide()).isEqualTo(FrameMotionRun.RUNNING)
    }

    @Test
    fun `un apercu ne s'anime jamais`() {
        assertThat(decide(animates = false)).isEqualTo(FrameMotionRun.STILL)
    }

    @Test
    fun `la reduction de mouvement laisse le cadre fixe`() {
        assertThat(decide(reduceMotion = true)).isEqualTo(FrameMotionRun.STILL)
    }

    @Test
    fun `l'economie d'energie laisse le cadre fixe`() {
        assertThat(decide(powerSaver = true)).isEqualTo(FrameMotionRun.STILL)
    }

    @Test
    fun `hors ecran le mouvement est en pause`() {
        assertThat(decide(onScreen = false)).isEqualTo(FrameMotionRun.PAUSED)
    }

    @Test
    fun `en arriere-plan le mouvement est en pause`() {
        assertThat(decide(appForeground = false)).isEqualTo(FrameMotionRun.PAUSED)
    }

    @Test
    fun `un mouvement interdit reste fixe meme hors ecran`() {
        assertThat(decide(reduceMotion = true, onScreen = false)).isEqualTo(FrameMotionRun.STILL)
    }
}
