package me.meeshy.app.calls

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallAudioStageLayout
import me.meeshy.sdk.model.call.CallControlsDisposition
import me.meeshy.sdk.model.call.CallDuoAudioFit
import me.meeshy.sdk.model.call.CallGroupStageSizing
import me.meeshy.sdk.model.call.CallParticipantLeftPayload
import me.meeshy.sdk.model.call.CallPillText
import me.meeshy.sdk.model.call.CallScreenLayer
import me.meeshy.sdk.model.call.CallScreenPanel
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallTranscriptionActive
import me.meeshy.sdk.model.call.CallTranslatedSegmentPayload
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #18488 (famille de #17927) — a duo AUDIO call at a compact height (phone in landscape ≈ 360 dp, low window 320 dp, the
 * 568 × 320 of the web witness): the whole pill, (…) included, stays inside the window and touchable (48 dp), with the
 * real journal open in it; the avatar, the name and the duration are in their compact form (P9b). The arrangement is the
 * one of `CallConnectedColumn`, built from the same laws and the same composables.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallDuoAudioCompactHeightTest {
    @get:Rule val rule = createComposeRule()

    private val config = CallConfig(peerId = "u1", peerName = "Awa", isVideo = false, isOutgoing = true)
    private val state = CallPresenter.present(
        CallState.Connected,
        config,
        CallMedia(),
        elapsedSeconds = 252,
        peerAudioEnabled = true,
        peerVideoEnabled = false,
        mediaEstablished = true,
    )

    private fun captionsViewModel(): CallCaptionsViewModel {
        val session = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        }
        val controller = CallCaptionsController(
            wires = CallCaptionsWires(
                MutableSharedFlow<CallTranslatedSegmentPayload>(),
                MutableSharedFlow<ByteArray>(),
                MutableSharedFlow<CallTranscriptionActive>(),
                MutableSharedFlow<CallParticipantLeftPayload>(),
            ) { _, _ -> },
            session = session,
            regime = CallConversationRegime { false },
            notice = CallCaptionsRefusalNotice { },
            clock = { 5_000L },
            scope = CoroutineScope(Dispatchers.Unconfined),
        )
        controller.onTransition(CallState.Idle, CallState.Connected, CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY))
        return CallCaptionsViewModel(controller)
    }

    private fun showDuoAudio(journalOpen: Boolean, stageDp: Int? = null) {
        val layer = if (journalOpen) CallScreenLayer.Panel(CallScreenPanel.Journal) else CallScreenLayer.Idle
        val pillText = if (journalOpen) CallPillText.Journal else CallPillText.None
        val captions = captionsViewModel()
        rule.setContent {
            MeeshyTheme {
                BoxWithConstraints((if (stageDp == null) Modifier.fillMaxSize() else Modifier.fillMaxWidth().height(stageDp.dp)).testTag(STAGE_TAG)) {
                    val stageHeight = maxHeight
                    val isCompactHeight = CallGroupStageSizing.isCompactHeight(stageHeight.value)
                    Column(
                        modifier = Modifier.matchParentSize().padding(
                            start = MeeshySpacing.xl,
                            end = MeeshySpacing.xl,
                            top = MeeshySpacing.xl,
                            bottom = CallDuoAudioFit.columnBottomDp(isCompactHeight).dp,
                        ),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Spacer(Modifier.height(MeeshySpacing.xl))
                        CallAudioStageSwitch(
                            compact = CallAudioStageLayout.compacts(pillText, isVideoStage = false, isCompactHeight = isCompactHeight, controlsShown = true),
                            state = state,
                            peer = CallPeerVisual.EMPTY,
                            stageHeightDp = stageHeight.value,
                            reduceMotion = true,
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                        )
                        CallControlsBlock(
                            pillText = pillText,
                            controlsVisible = true,
                            onRevive = {},
                            onInteraction = {},
                            bottomPadding = CallDuoAudioFit.blockBottomDp(isCompactHeight).dp,
                        ) {
                            CallControlsPill(
                                state = state,
                                layer = layer,
                                disposition = CallControlsDisposition.Rails,
                                rows = emptyList(),
                                items = emptyMap(),
                                outputIcon = MeeshyIcons.VolumeUpFilled,
                                onToggleMenu = {},
                                onToggleMute = {},
                                onOutput = {},
                                onHangUp = {},
                                onAction = {},
                                onBackToMenu = {},
                                onClosePanel = {},
                                pillText = pillText,
                                panelContent = {
                                    CallJournalPanel(
                                        onClose = {},
                                        viewModel = captions,
                                        listHeightDp = CallDuoAudioFit.journalListDp(stageHeight.value),
                                    )
                                },
                            )
                        }
                    }
                }
            }
        }
        rule.waitForIdle()
    }

    private fun assertWholeAndTouchable(description: String) = assertWholeAndTouchable(rule.onNodeWithContentDescription(description))

    private fun assertWholeAndTouchable(button: SemanticsNodeInteraction) {
        button.assertExists()
        val root = rule.onNodeWithTag(STAGE_TAG).fetchSemanticsNode().boundsInRoot
        val node = button.fetchSemanticsNode().boundsInRoot
        with(rule.density) {
            assertThat(node.height.toDp().value).isAtLeast(47.5f)
            assertThat(node.width.toDp().value).isAtLeast(47.5f)
        }
        assertThat(node.top).isAtLeast(root.top - 0.5f)
        assertThat(node.bottom).isAtMost(root.bottom + 0.5f)
    }

    private fun assertWholePill() {
        listOf("Show actions", "Mute microphone", "Audio output", "Hang up").forEach(::assertWholeAndTouchable)
    }

    @Test
    @Config(qualifiers = WINDOW_568)
    fun `568 x 320, at rest - the pill and its (…) stay whole, the peer in its compact form`() {
        showDuoAudio(journalOpen = false, stageDp = 320)
        assertWholePill()
        rule.onNodeWithTag(CALL_COMPACT_AUDIO_HEADER_TAG).assertExists()
        rule.onNodeWithTag(CALL_AUDIO_STAGE_TAG).assertDoesNotExist()
    }

    @Test
    @Config(qualifiers = WINDOW_640)
    fun `360 dp, at rest - the pill and its (…) stay whole, the peer in its compact form`() {
        showDuoAudio(journalOpen = false, stageDp = 360)
        assertWholePill()
        rule.onNodeWithTag(CALL_COMPACT_AUDIO_HEADER_TAG).assertExists()
    }

    @Test
    @Config(qualifiers = WINDOW_568)
    fun `568 x 320, journal open - the whole pill stays in the window and touchable`() {
        showDuoAudio(journalOpen = true, stageDp = 320)
        assertWholePill()
        assertWholeAndTouchable(rule.onAllNodesWithText("Transcript").onLast())
    }

    @Test
    @Config(qualifiers = WINDOW_640)
    fun `360 dp, journal open - the whole pill stays in the window and touchable`() {
        showDuoAudio(journalOpen = true, stageDp = 360)
        assertWholePill()
        assertWholeAndTouchable(rule.onAllNodesWithText("Transcript").onLast())
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    fun `a tall phone in portrait keeps the full stage and the 120 dp avatar at rest`() {
        showDuoAudio(journalOpen = false)
        assertWholePill()
        rule.onNodeWithTag(CALL_AUDIO_STAGE_TAG).assertExists()
        rule.onNodeWithTag(CALL_COMPACT_AUDIO_HEADER_TAG).assertDoesNotExist()
    }

    private companion object {
        const val STAGE_TAG = "duo-stage"

        /**
         * The witness measures the STAGE at the heights of the law (`CallDuoAudioFit`, from 320 dp up, the 568 x 320 of
         * the web witness): a window of that height under Robolectric loses its system bars (320 dp leaves a 272 dp
         * stage), so the stage is set at its height inside a window tall enough to hold it.
         */
        const val WINDOW_568 = "w568dp-h420dp-land"
        const val WINDOW_640 = "w640dp-h420dp-land"
    }
}
