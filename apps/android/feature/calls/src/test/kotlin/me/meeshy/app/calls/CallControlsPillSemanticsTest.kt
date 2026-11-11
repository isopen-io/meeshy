package me.meeshy.app.calls

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallControlsDisposition
import me.meeshy.sdk.model.call.CallGroupStageSizing
import me.meeshy.sdk.model.call.CallScreenLayer
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallControlsPillSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private val config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true)

    private fun ui(muted: Boolean = false, cameraOn: Boolean = true) = CallPresenter.present(
        state = CallState.Connected,
        config = config,
        media = CallMedia(isMuted = muted, isCameraOn = cameraOn),
        mediaEstablished = true,
    )

    private val offered = listOf(
        OfferedCallAction(CallAction.Captions, CallActionPresentation(Icons.Filled.Subtitles, R.string.call_action_speaker)),
    )

    private fun setPill(
        layer: CallScreenLayer = CallScreenLayer.Idle,
        disposition: CallControlsDisposition = CallControlsDisposition.Rows,
        muted: Boolean = false,
        cameraOn: Boolean = true,
        taps: MutableList<String> = mutableListOf(),
        actions: MutableList<CallAction> = mutableListOf(),
    ) {
        val state = ui(muted, cameraOn)
        val items = CallPillModel.items(state, offered)
        val set = CallPillModel.available(state, items) { false }
        rule.setContent {
            MeeshyTheme {
                CallControlsPill(
                    state = state,
                    layer = layer,
                    disposition = disposition,
                    rows = CallGroupStageSizing.rows(disposition.pillRows(set, layer), isCompactHeight = false),
                    items = items,
                    outputIcon = Icons.Filled.VolumeUp,
                    onToggleMenu = { taps += "more" },
                    onToggleMute = { taps += "mute" },
                    onOutput = { taps += "output" },
                    onHangUp = { taps += "end" },
                    onAction = { actions += it },
                    onBackToMenu = {},
                    onClosePanel = {},
                )
            }
        }
    }

    @Test
    fun `the pill always carries more, microphone, output and end with their labels`() {
        setPill()
        rule.onNodeWithContentDescription("Show actions").assertHasClickAction()
        rule.onNodeWithContentDescription("Mute microphone").assertHasClickAction()
        rule.onNodeWithContentDescription("Audio output").assertHasClickAction()
        rule.onNodeWithContentDescription("Hang up").assertHasClickAction()
    }

    @Test
    fun `the more button names what it does, Show actions folded and Hide actions open`() {
        setPill(layer = CallScreenLayer.Menu)
        rule.onNodeWithContentDescription("Hide actions").assertHasClickAction()
        rule.onNodeWithContentDescription("Show actions").assertDoesNotExist()
    }

    @Test
    fun `the camera button names the action it performs, Turn off camera when on and Turn on camera when off`() {
        setPill(layer = CallScreenLayer.Menu)
        rule.onNodeWithContentDescription("Turn off camera").assertHasClickAction()
        rule.onNodeWithContentDescription("Turn on camera").assertDoesNotExist()
    }

    @Test
    fun `a camera that is off offers to turn it on`() {
        setPill(layer = CallScreenLayer.Menu, cameraOn = false)
        rule.onNodeWithContentDescription("Turn on camera").assertHasClickAction()
        rule.onNodeWithContentDescription("Turn off camera").assertDoesNotExist()
    }

    @Test
    fun `a muted microphone offers to unmute it`() {
        setPill(muted = true)
        rule.onNodeWithContentDescription("Unmute microphone").assertExists()
        rule.onNodeWithContentDescription("Mute microphone").assertDoesNotExist()
    }

    @Test
    fun `folded, the pill shows no family rows`() {
        setPill()
        rule.onNodeWithText("My image".uppercase()).assertDoesNotExist()
    }

    @Test
    fun `on a group, the open menu stacks one titled row per family in the pill`() {
        setPill(layer = CallScreenLayer.Menu)
        rule.onNodeWithText("My image".uppercase()).assertExists()
        rule.onNodeWithText("The call".uppercase()).assertExists()
    }

    @Test
    fun `on a duo, the open menu leaves the pill as it was, its actions are on the rails`() {
        setPill(layer = CallScreenLayer.Menu, disposition = CallControlsDisposition.Rails)
        rule.onNodeWithText("My image".uppercase()).assertDoesNotExist()
        rule.onNodeWithText("The call".uppercase()).assertDoesNotExist()
        rule.onNodeWithContentDescription("Speaker").assertDoesNotExist()
        rule.onNodeWithContentDescription("Hide actions").assertHasClickAction()
    }

    @Test
    fun `each base button reports its tap`() {
        val taps = mutableListOf<String>()
        setPill(taps = taps)
        rule.onNodeWithContentDescription("Show actions").performClick()
        rule.onNodeWithContentDescription("Mute microphone").performClick()
        rule.onNodeWithContentDescription("Audio output").performClick()
        rule.onNodeWithContentDescription("Hang up").performClick()
        assertThat(taps).containsExactly("more", "mute", "output", "end").inOrder()
    }

    @Test
    fun `a family action runs through the action callback`() {
        val actions = mutableListOf<CallAction>()
        setPill(layer = CallScreenLayer.Menu, actions = actions)
        rule.onNodeWithContentDescription("Speaker").performClick()
        assertThat(actions).containsExactly(CallAction.Captions)
    }
}
