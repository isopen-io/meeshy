package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FullscreenVideoGesturesTest {

    @Test
    fun `le glissement ne suit le doigt qu'au dela de 30`() {
        assertThat(FullscreenVideoGestures.isSwipeDownActive(30f)).isFalse()
        assertThat(FullscreenVideoGestures.isSwipeDownActive(31f)).isTrue()
        assertThat(FullscreenVideoGestures.isSwipeDownActive(-80f)).isFalse()
    }

    @Test
    fun `le decalage ne monte jamais`() {
        assertThat(FullscreenVideoGestures.dragOffset(-20f)).isEqualTo(0f)
        assertThat(FullscreenVideoGestures.dragOffset(42f)).isEqualTo(42f)
    }

    @Test
    fun `un court glissement revient en place`() {
        assertThat(FullscreenVideoGestures.swipeDownEnded(100f, isPlaying = true, pipActive = false))
            .isEqualTo(SwipeDownOutcome.SnapBack)
    }

    @Test
    fun `un long glissement ferme et demande le PiP en lecture`() {
        assertThat(FullscreenVideoGestures.swipeDownEnded(200f, isPlaying = true, pipActive = false))
            .isEqualTo(SwipeDownOutcome.Dismiss(requestPip = true))
        assertThat(FullscreenVideoGestures.swipeDownEnded(200f, isPlaying = false, pipActive = false))
            .isEqualTo(SwipeDownOutcome.Dismiss(requestPip = false))
        assertThat(FullscreenVideoGestures.swipeDownEnded(200f, isPlaying = false, pipActive = true))
            .isEqualTo(SwipeDownOutcome.Dismiss(requestPip = true))
    }

    @Test
    fun `le pincement bascule remplissage et ajustement`() {
        assertThat(FullscreenVideoGestures.fitAfterPinch(1.4f)).isEqualTo(VideoFrameFit.FILL)
        assertThat(FullscreenVideoGestures.fitAfterPinch(0.7f)).isEqualTo(VideoFrameFit.FIT)
        assertThat(FullscreenVideoGestures.fitAfterPinch(1f)).isEqualTo(VideoFrameFit.FIT)
        assertThat(VideoFrameFit.FIT.toggled()).isEqualTo(VideoFrameFit.FILL)
        assertThat(VideoFrameFit.FILL.toggled()).isEqualTo(VideoFrameFit.FIT)
    }

    @Test
    fun `un tap bascule le chrome`() {
        val start = FullscreenChromeState.of()
        val immersive = FullscreenVideoGestures.chromeAfterTap(start)
        assertThat(immersive.showsChrome).isFalse()
        assertThat(FullscreenVideoGestures.chromeAfterTap(immersive).showsChrome).isTrue()
    }
}
