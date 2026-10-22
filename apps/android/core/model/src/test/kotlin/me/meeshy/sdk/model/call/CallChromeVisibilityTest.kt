package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallChromeVisibilityTest {
    @Test
    fun `revealed chrome shows everything`() {
        val chrome = CallChromeVisibility()
        assertThat(CallChromeElement.entries.all { chrome.isVisible(it) }).isTrue()
    }

    @Test
    fun `hidden chrome keeps captions, consent and self view`() {
        val chrome = CallChromeVisibility(isRevealed = false)
        assertThat(chrome.isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.isVisible(CallChromeElement.Header)).isFalse()
        assertThat(chrome.isVisible(CallChromeElement.Captions)).isTrue()
        assertThat(chrome.isVisible(CallChromeElement.RecordingConsent)).isTrue()
        assertThat(chrome.isVisible(CallChromeElement.SelfView)).isTrue()
    }

    @Test
    fun `a mode hides the chrome and the self view but not captions or consent`() {
        val chrome = CallChromeVisibility(isModeActive = true)
        assertThat(chrome.isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.isVisible(CallChromeElement.SelfView)).isFalse()
        assertThat(chrome.isVisible(CallChromeElement.Captions)).isTrue()
        assertThat(chrome.isVisible(CallChromeElement.RecordingConsent)).isTrue()
    }

    @Test
    fun `toggled flips only the reveal`() {
        val chrome = CallChromeVisibility(isStageFullScreen = false, isModeActive = false).toggled()
        assertThat(chrome.isRevealed).isFalse()
        assertThat(chrome.toggled().isRevealed).isTrue()
    }

    @Test
    fun `taps toggle only on a video stage and never under TalkBack`() {
        assertThat(CallChromeVisibility.mayToggleByTap(isVideoStage = true)).isTrue()
        assertThat(CallChromeVisibility.mayToggleByTap(isVideoStage = false)).isFalse()
        assertThat(CallChromeVisibility.mayToggleByTap(isVideoStage = true, isTouchExplorationOn = true)).isFalse()
    }

    @Test
    fun `video stage rules for duo and group`() {
        assertThat(CallChromeVisibility.isVideoStage(false, false, true, 0)).isTrue()
        assertThat(CallChromeVisibility.isVideoStage(false, true, false, 3)).isFalse()
        assertThat(CallChromeVisibility.isVideoStage(true, true, false, 0)).isTrue()
        assertThat(CallChromeVisibility.isVideoStage(true, false, false, 2)).isTrue()
        assertThat(CallChromeVisibility.isVideoStage(true, false, false, 0)).isFalse()
    }

    @Test
    fun `a touch during the fade is still accepted, after it is not`() {
        assertThat(CallChromeVisibility.FADE_DURATION_MILLIS).isEqualTo(250)
        assertThat(CallChromeVisibility.acceptsTouches(isVisible = false, hiddenForMillis = 100)).isTrue()
        assertThat(CallChromeVisibility.acceptsTouches(isVisible = false, hiddenForMillis = 250)).isFalse()
        assertThat(CallChromeVisibility.acceptsTouches(isVisible = true, hiddenForMillis = 9_999)).isTrue()
    }

    @Test
    fun `only revive reveals the chrome`() {
        assertThat(CallChromeInteraction.entries.filter { it.revealsChrome }).containsExactly(CallChromeInteraction.Revive)
    }

    @Test
    fun `scroll rule maps start and stop only`() {
        assertThat(CallChromeScrollRule.interaction(false, true)).isEqualTo(CallChromeInteraction.TouchBegan)
        assertThat(CallChromeScrollRule.interaction(true, false)).isEqualTo(CallChromeInteraction.TouchEnded)
        assertThat(CallChromeScrollRule.interaction(true, true)).isNull()
        assertThat(CallChromeScrollRule.interaction(false, false)).isNull()
    }
}
