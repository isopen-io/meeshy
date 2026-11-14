package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallScreenLayer
import me.meeshy.sdk.model.call.CallScreenMode
import me.meeshy.sdk.model.call.CallScreenPanel
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

class CallChromeControllerTest {
    private class Clock(var now: Long = 1_000L) : () -> Long {
        override fun invoke(): Long = now
    }

    private fun controller(clock: Clock = Clock()) = CallChromeController(clock)

    @Test
    fun `the chrome starts revealed`() {
        val chrome = controller()
        assertThat(chrome.visibility(isTapStage = true, isTouchExplorationOn = false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `a tap on a video scene hides the chrome and a second tap brings it back`() {
        val chrome = controller()
        chrome.onSceneTap(isTapStage = true, isTouchExplorationOn = false)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Header)).isFalse()
        chrome.onSceneTap(isTapStage = true, isTouchExplorationOn = false)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    /** #17945 (B) — this witness used to read « an audio call never hides its chrome »: the decision extends law 11 to a duo audio call. */
    @Test
    fun `a tap on the background of a duo audio call stows the chrome and a second tap brings it back`() {
        val chrome = controller()
        val duoAudio = CallChromeVisibility.isTapStage(isVideoStage = false, isConnected = true)
        chrome.onSceneTap(isTapStage = duoAudio, isTouchExplorationOn = false)
        assertThat(chrome.visibility(duoAudio, false).isVisible(CallChromeElement.Header)).isFalse()
        assertThat(chrome.visibility(duoAudio, false).isVisible(CallChromeElement.Controls)).isFalse()
        chrome.onSceneTap(isTapStage = duoAudio, isTouchExplorationOn = false)
        assertThat(chrome.visibility(duoAudio, false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    /** #17945 extended — this witness used to read « a group with no camera on never hides its chrome to a tap ». */
    @Test
    fun `a tap on the background of a group with no camera on stows the chrome and a second tap brings it back`() {
        val chrome = controller()
        val audioGroup = callIsTapStage(connected(video = false, cameraOn = false), CallGroupVideoStage(remoteCamerasOn = 0))
        chrome.onSceneTap(isTapStage = audioGroup, isTouchExplorationOn = false)
        assertThat(chrome.visibility(audioGroup, false).isVisible(CallChromeElement.Header)).isFalse()
        assertThat(chrome.visibility(audioGroup, false).isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.visibility(audioGroup, false).isVisible(CallChromeElement.Captions)).isTrue()
        chrome.onSceneTap(isTapStage = audioGroup, isTouchExplorationOn = false)
        assertThat(chrome.visibility(audioGroup, false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `under TalkBack a group with no camera on keeps its chrome`() {
        val chrome = controller()
        val audioGroup = callIsTapStage(connected(video = false, cameraOn = false), CallGroupVideoStage(remoteCamerasOn = 0))
        chrome.onSceneTap(isTapStage = audioGroup, isTouchExplorationOn = true)
        assertThat(chrome.visibility(audioGroup, true).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `a group whose last camera goes off keeps its stowed chrome stowed`() {
        val chrome = controller()
        val audio = connected(video = false, cameraOn = false)
        chrome.onSceneTap(isTapStage = callIsTapStage(audio, CallGroupVideoStage(remoteCamerasOn = 1)), isTouchExplorationOn = false)
        val noCamera = callIsTapStage(audio, CallGroupVideoStage(remoteCamerasOn = 0))
        assertThat(chrome.visibility(noCamera, false).isVisible(CallChromeElement.Controls)).isFalse()
    }

    @Test
    fun `under TalkBack the chrome never hides`() {
        val chrome = controller()
        chrome.onSceneTap(isTapStage = true, isTouchExplorationOn = true)
        assertThat(chrome.visibility(true, true).isVisible(CallChromeElement.Controls)).isTrue()
    }

    @Test
    fun `turning TalkBack on lights a hidden chrome without a tap`() {
        val chrome = controller()
        chrome.onSceneTap(isTapStage = true, isTouchExplorationOn = false)
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
        assertThat(chrome.acceptsTouches(isTapStage = true, isTouchExplorationOn = false)).isTrue()
        clock.now += 1
        assertThat(chrome.acceptsTouches(isTapStage = true, isTouchExplorationOn = false)).isFalse()
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
    fun `the journal button of the stowed captions relights the chrome and opens the journal in the pill`() {
        val chrome = controller()
        chrome.onSceneTap(true, false)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isFalse()
        chrome.open(CallScreenPanel.Journal)
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Controls)).isTrue()
        assertThat(chrome.state.value.layer.pillPanel).isEqualTo(CallScreenPanel.Journal)
    }

    @Test
    fun `the menu over an open journal stows it and closing the menu gives it back`() {
        val chrome = controller()
        chrome.open(CallScreenPanel.Journal)
        chrome.toggleMenu()
        assertThat(chrome.state.value.layer).isEqualTo(CallScreenLayer.MenuOverJournal)
        chrome.toggleMenu()
        assertThat(chrome.state.value.layer).isEqualTo(CallScreenLayer.Panel(CallScreenPanel.Journal))
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

    @Test
    fun `a full screen spotlight hides the header and the pill, even on audio, and gives them back`() {
        val chrome = controller()
        chrome.setStageFullScreen(true)
        assertThat(chrome.visibility(false, false).isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.visibility(true, true).isVisible(CallChromeElement.Header)).isFalse()
        assertThat(chrome.visibility(true, false).isVisible(CallChromeElement.Captions)).isTrue()
        chrome.setStageFullScreen(false)
        assertThat(chrome.visibility(false, false).isVisible(CallChromeElement.Controls)).isTrue()
    }

    private fun connected(video: Boolean, cameraOn: Boolean) = CallPresenter.present(
        state = CallState.Connected,
        config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = video, isOutgoing = true),
        media = CallMedia(isMuted = false, isCameraOn = cameraOn),
        mediaEstablished = true,
    )

    @Test
    fun `a group born audio becomes a video scene as soon as another camera lights (G1_13)`() {
        val audioGroup = connected(video = false, cameraOn = false)
        assertThat(callIsVideoStage(audioGroup, CallGroupVideoStage(remoteCamerasOn = 0))).isFalse()
        assertThat(callIsVideoStage(audioGroup, CallGroupVideoStage(remoteCamerasOn = 1))).isTrue()
    }

    @Test
    fun `a group born video with no camera on is not a video scene, yet a tap still stows its chrome (G1_13, #17945)`() {
        val videoGroup = connected(video = true, cameraOn = false)
        assertThat(callIsVideoStage(videoGroup, CallGroupVideoStage(remoteCamerasOn = 0))).isFalse()
        assertThat(callIsTapStage(videoGroup, CallGroupVideoStage(remoteCamerasOn = 0))).isTrue()
    }

    @Test
    fun `my own camera is enough for a group video scene, a duo still follows its video (G1_13)`() {
        assertThat(callIsVideoStage(connected(video = true, cameraOn = true), CallGroupVideoStage(remoteCamerasOn = 0))).isTrue()
        assertThat(callIsVideoStage(connected(video = true, cameraOn = false))).isTrue()
        assertThat(callIsVideoStage(connected(video = false, cameraOn = false))).isFalse()
    }

    /** #17945 extended — the group with no camera on used to be « not a tap stage »: it is one now. */
    @Test
    fun `law 11 (#17945) a duo audio call in progress and a group with no camera on are tap stages`() {
        val audio = connected(video = false, cameraOn = false)
        assertThat(callIsTapStage(audio)).isTrue()
        assertThat(callIsTapStage(audio, CallGroupVideoStage(remoteCamerasOn = 0))).isTrue()
        assertThat(callIsTapStage(audio, CallGroupVideoStage(remoteCamerasOn = 1))).isTrue()
        assertThat(callIsTapStage(connected(video = true, cameraOn = false))).isTrue()
    }
}
