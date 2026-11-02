package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallPillControlsTest {
    @get:Rule val rule = createComposeRule()

    private val config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = false, isOutgoing = true)

    private fun connected(media: CallMedia = CallMedia()) =
        CallPresenter.present(CallState.Connected, config, media, elapsedSeconds = 65)

    private class Taps {
        var reopen = 0
        var mute = 0
        var speaker = 0
        var hangUp = 0
    }

    private fun show(state: CallUiState): Taps {
        val taps = Taps()
        rule.setContent {
            MeeshyTheme {
                CallPill(
                    state = state,
                    onClick = { taps.reopen++ },
                    onToggleMute = { taps.mute++ },
                    onToggleSpeaker = { taps.speaker++ },
                    onHangUp = { taps.hangUp++ },
                )
            }
        }
        return taps
    }

    @Test
    fun `the minimised pill hangs up without reopening the call`() {
        val taps = show(connected())

        rule.onNodeWithContentDescription("Hang up").performClick()

        assertThat(taps.hangUp).isEqualTo(1)
        assertThat(taps.reopen).isEqualTo(0)
    }

    @Test
    fun `the minimised pill mutes, and once muted offers to unmute`() {
        val taps = show(connected(CallMedia(isMuted = true)))

        rule.onNodeWithContentDescription("Unmute").performClick()

        assertThat(taps.mute).isEqualTo(1)
        assertThat(taps.reopen).isEqualTo(0)
    }

    @Test
    fun `the minimised pill switches the audio output and names the current one`() {
        val taps = show(connected(CallMedia(isSpeakerOn = false)))

        rule.onNodeWithContentDescription("Earpiece").performClick()

        assertThat(taps.speaker).isEqualTo(1)
    }

    @Test
    fun `touching the identity part reopens the call`() {
        val taps = show(connected())

        rule.onNodeWithContentDescription("Ongoing call with Alice").performClick()

        assertThat(taps.reopen).isEqualTo(1)
    }
}
