package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.OutgoingRingingLabel
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallScreenSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private val config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = false, isOutgoing = true)

    private fun ui(state: CallState, elapsed: Long = 0) =
        CallPresenter.present(state, config, CallMedia(), elapsedSeconds = elapsed)

    @Test
    fun `an outgoing call first says it is placing the call`() {
        rule.setContent {
            MeeshyTheme {
                CallOutgoingRingingBody(ui(CallState.Ringing(true)), OutgoingRingingLabel.Placing, null, true, {})
            }
        }
        rule.onNodeWithText("Calling…").assertExists()
        rule.onNodeWithText("The other person hasn't answered yet.").assertDoesNotExist()
    }

    @Test
    fun `after the wait it says it waits for the peer with its hint`() {
        rule.setContent {
            MeeshyTheme {
                CallOutgoingRingingBody(ui(CallState.Ringing(true)), OutgoingRingingLabel.WaitingForPeer, null, true, {})
            }
        }
        rule.onNodeWithText("Waiting for the other person…").assertExists()
        rule.onNodeWithText("The other person hasn't answered yet.").assertExists()
    }

    @Test
    fun `a transient failure offers a labelled retry`() {
        rule.setContent {
            MeeshyTheme {
                CallEndedPanel(ui(CallState.Ended(CallEndReason.ConnectionLost)), null, {}, {})
            }
        }
        rule.onNodeWithText("Connection lost").assertExists()
        rule.onNodeWithText("Retry").assertExists()
    }

    @Test
    fun `a normal end offers no retry`() {
        rule.setContent {
            MeeshyTheme {
                CallEndedPanel(ui(CallState.Ended(CallEndReason.Remote), elapsed = 65), null, {}, {})
            }
        }
        rule.onNodeWithText("Your contact ended the call").assertExists()
        rule.onNodeWithText("Retry").assertDoesNotExist()
        rule.onNodeWithText("01:05").assertExists()
    }

    @Test
    fun `the incoming screen names the caller and the call kind`() {
        val incoming = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = false)
        rule.setContent {
            MeeshyTheme {
                IncomingCallScreen(
                    state = CallPresenter.present(CallState.Ringing(false), incoming, CallMedia()),
                    accent = CallPalette.Brand,
                    avatarUrl = null,
                    reduceMotion = true,
                    onAccept = {},
                    onDecline = {},
                )
            }
        }
        rule.onNodeWithText("Alice").assertExists()
        rule.onNodeWithText("Incoming video call").assertExists()
        rule.onNodeWithContentDescription("Decline. Declines the incoming call").assertExists()
    }

    @Test
    fun `each transition has a spoken announcement except ringing`() {
        assertThat(CallAnnouncements.resFor(CallStatus.CONNECTING)).isEqualTo(R.string.call_a11y_connecting)
        assertThat(CallAnnouncements.resFor(CallStatus.RECONNECTING)).isEqualTo(R.string.call_a11y_reconnecting)
        assertThat(CallAnnouncements.resFor(CallStatus.ENDED)).isEqualTo(R.string.call_a11y_ended)
        assertThat(CallAnnouncements.resFor(CallStatus.OUTGOING_RINGING)).isNull()
    }
}
