package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
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
    fun `the audio stage names the peer and shows the weak network pill`() {
        rule.setContent {
            MeeshyTheme { CallAudioStage(connected(peerQualityDegraded = true), peerAvatarUrl = null) }
        }
        rule.onNodeWithText("Alice").assertExists()
        rule.onNodeWithText("Poor network (contact)").assertExists()
        rule.onNodeWithText("Server disconnected").assertDoesNotExist()
    }

    @Test
    fun `the audio stage shows the server disconnected pill and the muted contact pill`() {
        rule.setContent {
            MeeshyTheme { CallAudioStage(connected(peerAudio = false), peerAvatarUrl = null, signalingDegraded = true) }
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
}
