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

    private fun ui(muted: Boolean = false) = CallPresenter.present(
        state = CallState.Connected,
        config = config,
        media = CallMedia(isMuted = muted),
        mediaEstablished = true,
    )

    private val offered = listOf(
        OfferedCallAction(CallAction.Captions, CallActionPresentation(Icons.Filled.Subtitles, R.string.call_action_speaker)),
    )

    private fun setPill(
        layer: CallScreenLayer = CallScreenLayer.Idle,
        muted: Boolean = false,
        taps: MutableList<String> = mutableListOf(),
        actions: MutableList<CallAction> = mutableListOf(),
    ) {
        val state = ui(muted)
        val items = CallPillModel.items(state, offered)
        val set = CallPillModel.available(state, items) { false }
        rule.setContent {
            MeeshyTheme {
                CallControlsPill(
                    state = state,
                    layer = layer,
                    rows = CallPillModel.rows(set, isCompactHeight = false),
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
        rule.onNodeWithContentDescription("More actions").assertHasClickAction()
        rule.onNodeWithContentDescription("Mute microphone").assertHasClickAction()
        rule.onNodeWithContentDescription("Output").assertHasClickAction()
        rule.onNodeWithContentDescription("Hang up").assertHasClickAction()
    }

    @Test
    fun `a muted microphone offers to unmute it`() {
        setPill(muted = true)
        rule.onNodeWithContentDescription("Unmute microphone").assertExists()
        rule.onNodeWithContentDescription("Mute microphone").assertDoesNotExist()
    }

    @Test
    fun `folded, the pill shows no family rows nor captions`() {
        setPill()
        rule.onNodeWithText("My image".uppercase()).assertDoesNotExist()
        rule.onNodeWithText("Mic", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `unfolded, the pill stacks one titled row per family and captions the base row`() {
        setPill(layer = CallScreenLayer.Menu)
        rule.onNodeWithText("My image".uppercase()).assertExists()
        rule.onNodeWithText("The call".uppercase()).assertExists()
        rule.onNodeWithText("Mic", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `each base button reports its tap`() {
        val taps = mutableListOf<String>()
        setPill(taps = taps)
        rule.onNodeWithContentDescription("More actions").performClick()
        rule.onNodeWithContentDescription("Mute microphone").performClick()
        rule.onNodeWithContentDescription("Output").performClick()
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
