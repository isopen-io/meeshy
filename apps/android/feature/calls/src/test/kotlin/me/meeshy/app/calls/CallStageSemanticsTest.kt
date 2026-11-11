package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.click
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import androidx.compose.ui.graphics.TransformOrigin
import me.meeshy.sdk.model.call.CallDuoStageLayout
import me.meeshy.sdk.model.call.CallSelfTileCorner
import me.meeshy.sdk.model.call.CallSelfTileLaw
import me.meeshy.sdk.model.call.CallSelfTileMemory
import me.meeshy.sdk.model.call.CallSelfTileScale
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallStageSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private val config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true)

    private fun connected(
        peerAudio: Boolean = true,
        peerVideo: Boolean = true,
        peerQualityDegraded: Boolean = false,
        videoAutoPaused: Boolean = false,
    ) = CallPresenter.present(
        CallState.Connected,
        config,
        CallMedia(),
        elapsedSeconds = 65,
        peerQualityDegraded = peerQualityDegraded,
        peerAudioEnabled = peerAudio,
        peerVideoEnabled = peerVideo,
        videoAutoPaused = videoAutoPaused,
        mediaEstablished = true,
    )

    @Test
    fun `a peer without a picture shows its avatar and camera off, never a spinner`() {
        rule.setContent { MeeshyTheme { CallRemoteCameraOffPlaceholder("Alice", null, compact = false) } }
        rule.onNodeWithText("Camera off").assertExists()
        rule.onNodeWithText("Connecting video…").assertDoesNotExist()
    }

    @Test
    fun `before the wait elapses the peer picture says it is connecting`() {
        rule.setContent { MeeshyTheme { CallRemoteConnectingPlaceholder(compact = false) } }
        rule.onNodeWithText("Connecting video…").assertExists()
    }

    @Test
    fun `the audio stage names the peer, and the weak network lives in the header capsule not under the avatar`() {
        rule.setContent {
            MeeshyTheme { CallAudioStage(connected(peerQualityDegraded = true), peer = CallPeerVisual.EMPTY) }
        }
        rule.onNodeWithText("Alice").assertExists()
        rule.onNodeWithText("Poor network (contact)").assertDoesNotExist()
        rule.onNodeWithText("Server disconnected").assertDoesNotExist()
    }

    @Test
    fun `the audio stage shows the server disconnected pill and the muted contact pill`() {
        rule.setContent {
            MeeshyTheme { CallAudioStage(connected(peerAudio = false), peer = CallPeerVisual.EMPTY, signalingDegraded = true) }
        }
        rule.onNodeWithText("Server disconnected").assertExists()
        rule.onNodeWithText("Contact muted").assertExists()
        rule.onNodeWithText("Poor network (contact)").assertDoesNotExist()
    }

    @Test
    fun `the survival tile says the video is paused and will resume on its own`() {
        rule.setContent { MeeshyTheme { CallVideoPausedTileBody() } }
        rule.onNodeWithText("Video paused").assertExists()
        rule.onNodeWithText("Auto-resume").assertExists()
    }

    @Test
    fun `the self tile is adjustable and announces its size`() {
        val memory = CallSelfTileMemory()
        rule.setContent {
            MeeshyTheme {
                CallSelfTile(
                    callKey = "call-1",
                    memory = memory,
                    paused = false,
                    reduceMotion = true,
                    onSwap = {},
                    modifier = Modifier.fillMaxSize(),
                ) { Box(Modifier.fillMaxSize()) }
            }
        }
        val node = rule.onNodeWithContentDescription("Swap videos").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("Medium thumbnail")
        val actions = node.config[SemanticsActions.CustomActions]
        assertThat(actions.map { it.label }).containsExactly("Enlarge thumbnail", "Shrink thumbnail").inOrder()
    }

    @Test
    fun `enlarging the self tile moves it to the large scale and remembers it for the call`() {
        val memory = CallSelfTileMemory()
        rule.setContent {
            MeeshyTheme {
                CallSelfTile("call-1", memory, paused = false, reduceMotion = true, onSwap = {}, modifier = Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize())
                }
            }
        }
        val enlarge = rule.onNodeWithContentDescription("Swap videos").fetchSemanticsNode()
            .config[SemanticsActions.CustomActions].first { it.label == "Enlarge thumbnail" }
        rule.runOnUiThread { enlarge.action() }
        rule.waitForIdle()
        assertThat(memory.scale("call-1")).isEqualTo(CallSelfTileScale.X3)
        val node = rule.onNodeWithContentDescription("Swap videos").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("Large thumbnail")
    }

    @Test
    fun `a self tile of a call remembered at the small scale starts small`() {
        val memory = CallSelfTileMemory().apply { remember(CallSelfTileScale.X1, "call-1") }
        rule.setContent {
            MeeshyTheme {
                CallSelfTile("call-1", memory, paused = false, reduceMotion = true, onSwap = {}, modifier = Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize())
                }
            }
        }
        val node = rule.onNodeWithContentDescription("Swap videos").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("Small thumbnail")
    }

    @Test
    fun `a paused survival state is announced on the tile`() {
        rule.setContent {
            MeeshyTheme {
                CallSelfTile("c", CallSelfTileMemory(), paused = true, reduceMotion = true, onSwap = {}, modifier = Modifier.fillMaxSize()) {
                    CallVideoPausedTileBody()
                }
            }
        }
        val node = rule.onNodeWithContentDescription("Swap videos, Video paused. Weak connection, video will resume automatically")
            .fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("Medium thumbnail, Video paused")
    }

    private val noEgl = object : org.webrtc.EglBase.Context {
        override fun getNativeEglContext(): Long = 0
    }

    private fun duoStage(taps: () -> Unit) {
        rule.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize()) {
                    CallDuoVideoStage(
                        state = connected(videoAutoPaused = true),
                        callKey = "call-1",
                        remoteTrack = null,
                        localTrack = null,
                        eglContext = noEgl,
                        peerAvatarUrl = null,
                        connected = true,
                        reduceMotion = true,
                        layout = CallDuoStageLayout(isMyImageFullScreen = false, showsSelfTile = true),
                        selfTileMemory = CallSelfTileMemory(),
                        onSceneTap = taps,
                    )
                }
            }
        }
    }

    @Test
    fun `a tap on the scene reaches the scene handler, a tap on the tile stays the tile's`() {
        var sceneTaps = 0
        duoStage(taps = { sceneTaps++ })
        rule.onRoot().performTouchInput { click(Offset(width / 2f, height / 2f)) }
        assertThat(sceneTaps).isEqualTo(1)
        rule.onNodeWithContentDescription("Swap videos", substring = true).performClick()
        assertThat(sceneTaps).isEqualTo(1)
    }

    @Test
    fun `my tile with the controls shown swaps the videos and does not relight anything (G1_9)`() {
        var swaps = 0
        var reveals = 0
        rule.setContent {
            MeeshyTheme {
                CallSelfTile("c", CallSelfTileMemory(), paused = false, reduceMotion = true, onSwap = { swaps++ }, onReveal = { reveals++ }, controlsVisible = true, modifier = Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize())
                }
            }
        }
        rule.onNodeWithContentDescription("Swap videos").performTouchInput { click() }
        assertThat(swaps).isEqualTo(1)
        assertThat(reveals).isEqualTo(0)
    }

    @Test
    fun `my tile with the controls stowed gives them back first and does not swap (G1_9)`() {
        var swaps = 0
        var reveals = 0
        rule.setContent {
            MeeshyTheme {
                CallSelfTile("c", CallSelfTileMemory(), paused = false, reduceMotion = true, onSwap = { swaps++ }, onReveal = { reveals++ }, controlsVisible = false, modifier = Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize())
                }
            }
        }
        rule.onNodeWithContentDescription("Swap videos").performTouchInput { click() }
        assertThat(swaps).isEqualTo(0)
        assertThat(reveals).isEqualTo(1)
    }

    @Test
    fun `stowing the controls keeps the frame of the chosen scale, the tile only scales (G1_11)`() {
        var visible by mutableStateOf(true)
        rule.setContent {
            MeeshyTheme {
                CallSelfTile("c", CallSelfTileMemory(), paused = false, reduceMotion = true, onSwap = {}, controlsVisible = visible, modifier = Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize())
                }
            }
        }
        val shown = rule.onNodeWithContentDescription("Swap videos").fetchSemanticsNode().size
        visible = false
        rule.waitForIdle()
        assertThat(rule.onNodeWithContentDescription("Swap videos").fetchSemanticsNode().size).isEqualTo(shown)
    }

    @Test
    fun `what keeps the size of a small tile grows from its own corner, mirrored right to left (G1_11)`() {
        val bottomStart = CallSelfTileLaw.anchor(CallSelfTileCorner.BottomStart)
        assertThat(bottomStart.transformOrigin(rtl = false)).isEqualTo(TransformOrigin(0f, 1f))
        assertThat(bottomStart.transformOrigin(rtl = true)).isEqualTo(TransformOrigin(1f, 1f))
        assertThat(CallSelfTileLaw.anchor(CallSelfTileCorner.TopEnd).transformOrigin(rtl = true)).isEqualTo(TransformOrigin(0f, 0f))
    }
}
