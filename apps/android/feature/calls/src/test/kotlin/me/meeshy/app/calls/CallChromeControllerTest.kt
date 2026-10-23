package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallScreenLayer
import me.meeshy.sdk.model.call.CallScreenMode
import me.meeshy.sdk.model.call.CallScreenPanel
import org.junit.Test

class CallChromeControllerTest {
    private class Clock(var now: Long = 1_000L) : () -> Long {
        override fun invoke(): Long = now
    }

    private fun controller(clock: Clock = Clock()) = CallChromeController(clock)

    @Test
    fun `the chrome starts revealed`() {
        val chrome = controller()
        assertThat(chrome.visibility(isVideoStage = true, isTouchExplorationOn = false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `a tap on a video scene hides the chrome and a second tap brings it back`() {
        val chrome = controller()
        chrome.onSceneTap(isVideoStage = true, isTouchExplorationOn = false)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Header)).isFalse()
        chrome.onSceneTap(isVideoStage = true, isTouchExplorationOn = false)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `an audio call never hides its chrome`() {
        val chrome = controller()
        chrome.onSceneTap(isVideoStage = false, isTouchExplorationOn = false)
        assertThat(chrome.visibility(false, false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `under TalkBack the chrome never hides`() {
        val chrome = controller()
        chrome.onSceneTap(isVideoStage = true, isTouchExplorationOn = true)
        assertThat(chrome.visibility(true, true).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `turning TalkBack on lights a hidden chrome without a tap`() {
        val chrome = controller()
        chrome.onSceneTap(isVideoStage = true, isTouchExplorationOn = false)
        assertThat(chrome.visibility(true, true).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `captions stay while the chrome is hidden`() {
        val chrome = controller()
        chrome.onSceneTap(true, false)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Captions)).isTrue()
    }

    @Test
    fun `during the fade the hidden chrome still answers and afterwards it does not`() {
        val clock = Clock()
        val chrome = controller(clock)
        chrome.onSceneTap(true, false)
        clock.now += 249
        assertThat(chrome.acceptsTouches(isVideoStage = true, isTouchExplorationOn = false)).isTrue()
        clock.now += 1
        assertThat(chrome.acceptsTouches(isVideoStage = true, isTouchExplorationOn = false)).isFalse()
    }

    @Test
    fun `a touch received during the fade revives the chrome`() {
        val chrome = controller()
        chrome.onSceneTap(true, false)
        chrome.onInteraction(CallChromeInteraction.Revive)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `a finger put down does not reveal the chrome by itself`() {
        val chrome = controller()
        chrome.onSceneTap(true, false)
        chrome.onInteraction(CallChromeInteraction.TouchBegan)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isFalse()
    }

    @Test
    fun `only one panel or mode is open at a time`() {
        val chrome = controller()
        chrome.toggleMenu()
        assertThat(chrome.state.value.layer).isEqualTo(CallScreenLayer.Menu)
        chrome.open(CallScreenPanel.React)
        assertThat(chrome.state.value.layer).isEqualTo(CallScreenLayer.Panel(CallScreenPanel.React))
        chrome.open(CallScreenPanel.Record)
        assertThat(chrome.state.value.layer).isEqualTo(CallScreenLayer.Panel(CallScreenPanel.Record))
        chrome.backToMenu()
        assertThat(chrome.state.value.layer).isEqualTo(CallScreenLayer.Menu)
    }

    @Test
    fun `a mode frees the screen and reveals the chrome`() {
        val chrome = controller()
        chrome.onSceneTap(true, false)
        chrome.enter(CallScreenMode.Effects)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.state.value.isRevealed).isTrue()
        chrome.exitMode()
        assertThat(chrome.state.value.layer).isEqualTo(CallScreenLayer.Idle)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isTrue()
    }
}
