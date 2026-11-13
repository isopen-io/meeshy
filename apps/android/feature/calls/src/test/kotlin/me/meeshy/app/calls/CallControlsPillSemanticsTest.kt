package me.meeshy.app.calls

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
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
import me.meeshy.sdk.model.call.CallPillText
import me.meeshy.sdk.model.call.CallScreenLayer
import me.meeshy.sdk.model.call.CallScreenPanel
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
        pillText: CallPillText = CallPillText.None,
        captions: @Composable () -> Unit = {},
        panelContent: @Composable (CallScreenPanel) -> Unit = {},
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
                    pillText = pillText,
                    captions = captions,
                    panelContent = panelContent,
                    modifier = Modifier.testTag("pill"),
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

    @Test
    fun `the captions live in the pill above its base row, the base row stays touchable (#17343)`() {
        val taps = mutableListOf<String>()
        setPill(taps = taps, pillText = CallPillText.Captions, captions = { Text("Bonjour Ada") })
        rule.onNodeWithText("Bonjour Ada").assertIsDisplayed()
        rule.onNodeWithContentDescription("Hang up").performClick()
        assertThat(taps).containsExactly("end")
    }

    @Test
    fun `a pill without text carries no captions`() {
        setPill(pillText = CallPillText.None, captions = { Text("Bonjour Ada") })
        rule.onNodeWithText("Bonjour Ada").assertDoesNotExist()
    }

    @Test
    fun `the journal is drawn in the pill with no back button of its own, and the base row stays under it (#17343)`() {
        val taps = mutableListOf<String>()
        setPill(
            layer = CallScreenLayer.Panel(CallScreenPanel.Journal),
            taps = taps,
            pillText = CallPillText.Journal,
            panelContent = { Text("Journal du direct") },
        )
        rule.onNodeWithText("Journal du direct").assertIsDisplayed()
        rule.onNodeWithContentDescription("Back to actions").assertDoesNotExist()
        rule.onNodeWithContentDescription("Mute microphone").performClick()
        assertThat(taps).containsExactly("mute")
    }

    @Test
    @Config(sdk = [34], qualifiers = "w1000dp-h800dp")
    fun `on a wide screen the pill that carries text stops at 560 dp and the resting pill at 440 dp (#17343)`() {
        setPill(pillText = CallPillText.Captions, captions = { Text("Bonjour Ada") })
        rule.onNodeWithTag("pill").assertWidthIsEqualTo(560.dp)
    }

    @Test
    @Config(sdk = [34], qualifiers = "w1000dp-h800dp")
    fun `the resting pill keeps its 440 dp`() {
        setPill()
        rule.onNodeWithTag("pill").assertWidthIsEqualTo(440.dp)
    }

    @Test
    @Config(sdk = [34], qualifiers = "w1000dp-h800dp")
    fun `#17935 on a wide window the group pill with its two rows stops at the 560 dp of the duo, never 440`() {
        setPill(layer = CallScreenLayer.Menu)
        rule.onNodeWithTag("pill").assertWidthIsEqualTo(560.dp)
    }

    @Test
    @Config(sdk = [34], qualifiers = "w1000dp-h800dp")
    fun `#17935 an option held in the pill takes the same 560 dp, duo as group`() {
        setPill(layer = CallScreenLayer.Panel(CallScreenPanel.Record), disposition = CallControlsDisposition.Rails, panelContent = { Text("Audio") })
        rule.onNodeWithTag("pill").assertWidthIsEqualTo(560.dp)
    }

    @Test
    @Config(sdk = [34], qualifiers = "w1000dp-h800dp")
    fun `#17935 a duo's open menu brings out the rails and leaves the pill at rest, 440 dp`() {
        setPill(layer = CallScreenLayer.Menu, disposition = CallControlsDisposition.Rails)
        rule.onNodeWithTag("pill").assertWidthIsEqualTo(440.dp)
    }

    @Test
    @Config(sdk = [34], qualifiers = "w360dp-h780dp")
    fun `#17935 on a phone in portrait nothing changes, the group pill fills the width as before`() {
        setPill(layer = CallScreenLayer.Menu)
        rule.onNodeWithTag("pill").assertWidthIsEqualTo(360.dp)
    }

    @Test
    fun `folding the open menu keeps its rows while they fade, never a panel closed before`() {
        val state = ui()
        val items = CallPillModel.items(state, offered)
        val set = CallPillModel.available(state, items) { false }
        val rows = CallGroupStageSizing.rows(CallControlsDisposition.Rows.pillRows(set, CallScreenLayer.Menu), isCompactHeight = false)
        var layer by mutableStateOf<CallScreenLayer>(CallScreenLayer.Panel(CallScreenPanel.React))
        rule.setContent {
            MeeshyTheme {
                CallControlsPill(
                    state = state,
                    layer = layer,
                    disposition = CallControlsDisposition.Rows,
                    rows = rows,
                    items = items,
                    outputIcon = Icons.Filled.VolumeUp,
                    onToggleMenu = {},
                    onToggleMute = {},
                    onOutput = {},
                    onHangUp = {},
                    onAction = {},
                    onBackToMenu = {},
                    onClosePanel = {},
                    panelContent = { Text("Réactions") },
                )
            }
        }
        rule.onNodeWithText("Réactions").assertExists()
        layer = CallScreenLayer.Menu
        rule.waitForIdle()
        rule.onNodeWithText("My image".uppercase()).assertExists()

        rule.mainClock.autoAdvance = false
        layer = CallScreenLayer.Idle
        rule.mainClock.advanceTimeBy(100)

        rule.onNodeWithText("My image".uppercase()).assertExists()
        rule.onNodeWithText("Réactions").assertDoesNotExist()
    }

    @Test
    fun `opening an option from the open menu fades the rows into it in the same glass, never at once (G3_2)`() {
        var layer by mutableStateOf<CallScreenLayer>(CallScreenLayer.Menu)
        val state = ui()
        val items = CallPillModel.items(state, offered)
        val set = CallPillModel.available(state, items) { false }
        val rows = CallGroupStageSizing.rows(CallControlsDisposition.Rows.pillRows(set, CallScreenLayer.Menu), isCompactHeight = false)
        rule.setContent {
            MeeshyTheme {
                CallControlsPill(
                    state = state,
                    layer = layer,
                    disposition = CallControlsDisposition.Rows,
                    rows = rows,
                    items = items,
                    outputIcon = Icons.Filled.VolumeUp,
                    onToggleMenu = {},
                    onToggleMute = {},
                    onOutput = {},
                    onHangUp = {},
                    onAction = {},
                    onBackToMenu = {},
                    onClosePanel = {},
                    panelContent = { Text("Audio | Vidéo") },
                )
            }
        }
        rule.onNodeWithText("My image".uppercase()).assertExists()

        rule.mainClock.autoAdvance = false
        layer = CallScreenLayer.Panel(CallScreenPanel.Record)
        rule.waitForIdle()
        rule.mainClock.advanceTimeBy(100)

        rule.onNodeWithText("My image".uppercase()).assertExists()
        rule.onNodeWithText("Audio | Vidéo").assertExists()

        rule.mainClock.advanceTimeBy(1_000)

        rule.onNodeWithText("My image".uppercase()).assertDoesNotExist()
        rule.onNodeWithText("Audio | Vidéo").assertIsDisplayed()
    }

    @Test
    fun `a stowed pill keeps ONE glass, the captions stay and the base row folds out (G1_3)`() {
        var text by mutableStateOf(CallPillText.Captions)
        val state = ui()
        rule.setContent {
            MeeshyTheme {
                CallControlsPill(
                    state = state,
                    layer = CallScreenLayer.Idle,
                    disposition = CallControlsDisposition.Rows,
                    rows = emptyList(),
                    items = emptyMap(),
                    outputIcon = Icons.Filled.VolumeUp,
                    onToggleMenu = {},
                    onToggleMute = {},
                    onOutput = {},
                    onHangUp = {},
                    onAction = {},
                    onBackToMenu = {},
                    onClosePanel = {},
                    pillText = text,
                    captions = { Text("Bonjour Ada") },
                )
            }
        }
        rule.onNodeWithContentDescription("Hang up").assertExists()

        text = CallPillText.CaptionsAlone
        rule.mainClock.advanceTimeBy(1_000)

        rule.onNodeWithText("Bonjour Ada").assertIsDisplayed()
        rule.onNodeWithContentDescription("Hang up").assertDoesNotExist()
        rule.onNodeWithContentDescription("Mute microphone").assertDoesNotExist()
        text = CallPillText.Captions
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Hang up").assertExists()
    }

    @Test
    fun `closing the open menu tightens the pill progressively, legends and rows together, never at once (G3_4)`() {
        var layer by mutableStateOf<CallScreenLayer>(CallScreenLayer.Menu)
        val state = ui()
        val items = CallPillModel.items(state, offered)
        val set = CallPillModel.available(state, items) { false }
        val rows = CallGroupStageSizing.rows(CallControlsDisposition.Rows.pillRows(set, CallScreenLayer.Menu), isCompactHeight = false)
        rule.setContent {
            MeeshyTheme {
                CallControlsPill(
                    state = state,
                    layer = layer,
                    disposition = CallControlsDisposition.Rows,
                    rows = rows,
                    items = items,
                    outputIcon = Icons.Filled.VolumeUp,
                    onToggleMenu = {},
                    onToggleMute = {},
                    onOutput = {},
                    onHangUp = {},
                    onAction = {},
                    onBackToMenu = {},
                    onClosePanel = {},
                    modifier = Modifier.testTag("pill"),
                )
            }
        }
        val open = rule.onNodeWithTag("pill").fetchSemanticsNode().size.height

        rule.mainClock.autoAdvance = false
        layer = CallScreenLayer.Idle
        rule.waitForIdle()
        rule.mainClock.advanceTimeBy(100)
        val folding = rule.onNodeWithTag("pill").fetchSemanticsNode().size.height
        rule.mainClock.advanceTimeBy(1_000)
        val resting = rule.onNodeWithTag("pill").fetchSemanticsNode().size.height

        assertThat(folding).isLessThan(open)
        assertThat(folding).isGreaterThan(resting)
    }
}
