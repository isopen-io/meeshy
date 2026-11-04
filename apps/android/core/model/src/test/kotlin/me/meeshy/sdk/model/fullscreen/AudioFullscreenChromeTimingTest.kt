package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import kotlin.time.Duration.Companion.seconds
import org.junit.Test

class AudioFullscreenChromeTimingTest {

    @Test
    fun `le chrome s efface apres trois secondes de lecture`() {
        val delay = AudioFullscreenChromeTiming.autoHideDelay(FullscreenChromeState.Initial, isPlaying = true, screenReaderRunning = false)

        assertThat(delay).isEqualTo(3.seconds)
    }

    @Test
    fun `en pause le chrome reste`() {
        assertThat(AudioFullscreenChromeTiming.autoHideDelay(FullscreenChromeState.Initial, isPlaying = false, screenReaderRunning = false)).isNull()
    }

    @Test
    fun `sous TalkBack le chrome ne s efface jamais de lui-meme`() {
        assertThat(AudioFullscreenChromeTiming.autoHideDelay(FullscreenChromeState.Initial, isPlaying = true, screenReaderRunning = true)).isNull()
    }

    @Test
    fun `une ouverture ou l immersion n arment aucun delai`() {
        val opened = FullscreenChromeState.Initial.opening(FullscreenOverlay.Reactions)
        val immersive = FullscreenChromeState.of(isImmersive = true)

        assertThat(AudioFullscreenChromeTiming.autoHideDelay(opened, isPlaying = true, screenReaderRunning = false)).isNull()
        assertThat(AudioFullscreenChromeTiming.autoHideDelay(immersive, isPlaying = true, screenReaderRunning = false)).isNull()
    }
}
