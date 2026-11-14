package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #17529 — on an audio call, the journal open in the pill shrinks the avatar into the compact header (law 6, P9b):
 * the name and the duration beside a 56 dp avatar; closing the journal gives the full stage back. Mirrors iOS
 * `CallCompactAudioHeader`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallCompactAudioHeaderTest {
    @get:Rule val rule = createComposeRule()

    private val config = CallConfig(peerId = "u1", peerName = "Awa", isVideo = false, isOutgoing = true)

    private fun connected(peerAudio: Boolean = true) = CallPresenter.present(
        CallState.Connected,
        config,
        CallMedia(),
        elapsedSeconds = 252,
        peerAudioEnabled = peerAudio,
        peerVideoEnabled = false,
        mediaEstablished = true,
    )

    @Test
    fun `at rest the full stage holds the peer and no compact header is drawn`() {
        rule.setContent {
            MeeshyTheme { CallAudioStageSwitch(compact = false, state = connected(), peer = CallPeerVisual.EMPTY, reduceMotion = true) }
        }
        rule.onNodeWithTag(CALL_AUDIO_STAGE_TAG).assertExists()
        rule.onNodeWithTag(CALL_COMPACT_AUDIO_HEADER_TAG).assertDoesNotExist()
    }

    @Test
    fun `the open journal shows the compact header with the name and the named duration`() {
        rule.setContent {
            MeeshyTheme { CallAudioStageSwitch(compact = true, state = connected(), peer = CallPeerVisual.EMPTY, reduceMotion = true) }
        }
        rule.onNodeWithTag(CALL_COMPACT_AUDIO_HEADER_TAG).assertExists()
        rule.onNodeWithTag(CALL_AUDIO_STAGE_TAG).assertDoesNotExist()
        rule.onNodeWithText("Awa").assertExists()
        rule.onNodeWithContentDescription("Call duration").assertExists()
    }

    @Test
    fun `the compact header keeps the status pills while their cause lasts`() {
        rule.setContent {
            MeeshyTheme {
                CallCompactAudioHeader(state = connected(peerAudio = false), peer = CallPeerVisual.EMPTY, signalingDegraded = true)
            }
        }
        rule.onNodeWithText("Contact muted").assertExists()
        rule.onNodeWithText("Server disconnected").assertExists()
    }

    @Test
    fun `opening then closing the journal morphs between the two and settles on the right one`() {
        var compact by mutableStateOf(false)
        rule.setContent {
            MeeshyTheme { CallAudioStageSwitch(compact = compact, state = connected(), peer = CallPeerVisual.EMPTY, reduceMotion = false) }
        }

        compact = true
        rule.waitForIdle()
        rule.onNodeWithTag(CALL_COMPACT_AUDIO_HEADER_TAG).assertExists()
        rule.onNodeWithTag(CALL_AUDIO_STAGE_TAG).assertDoesNotExist()

        compact = false
        rule.waitForIdle()
        rule.onNodeWithTag(CALL_AUDIO_STAGE_TAG).assertExists()
        rule.onNodeWithTag(CALL_COMPACT_AUDIO_HEADER_TAG).assertDoesNotExist()
    }

    @Test
    fun `under reduce animations the passage still lands on the compact header`() {
        var compact by mutableStateOf(false)
        rule.setContent {
            MeeshyTheme { CallAudioStageSwitch(compact = compact, state = connected(), peer = CallPeerVisual.EMPTY, reduceMotion = true) }
        }

        compact = true
        rule.waitForIdle()
        rule.onNodeWithTag(CALL_COMPACT_AUDIO_HEADER_TAG).assertExists()
        rule.onNodeWithTag(CALL_AUDIO_STAGE_TAG).assertDoesNotExist()
    }
}
