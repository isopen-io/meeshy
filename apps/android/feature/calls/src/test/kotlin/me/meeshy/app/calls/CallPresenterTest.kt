package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

class CallPresenterTest {

    private val config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true)
    private val media = CallMedia()

    private fun present(state: CallState, config: CallConfig = this.config, media: CallMedia = this.media) =
        CallPresenter.present(state, config, media)

    @Test
    fun `idle maps to IDLE`() {
        assertThat(CallPresenter.statusOf(CallState.Idle)).isEqualTo(CallStatus.IDLE)
    }

    @Test
    fun `outgoing ringing maps to OUTGOING_RINGING`() {
        assertThat(CallPresenter.statusOf(CallState.Ringing(isOutgoing = true)))
            .isEqualTo(CallStatus.OUTGOING_RINGING)
    }

    @Test
    fun `incoming ringing maps to INCOMING`() {
        assertThat(CallPresenter.statusOf(CallState.Ringing(isOutgoing = false)))
            .isEqualTo(CallStatus.INCOMING)
    }

    @Test
    fun `offering collapses to CONNECTING`() {
        assertThat(CallPresenter.statusOf(CallState.Offering)).isEqualTo(CallStatus.CONNECTING)
    }

    @Test
    fun `connecting maps to CONNECTING`() {
        assertThat(CallPresenter.statusOf(CallState.Connecting)).isEqualTo(CallStatus.CONNECTING)
    }

    @Test
    fun `connected maps to CONNECTED`() {
        assertThat(CallPresenter.statusOf(CallState.Connected)).isEqualTo(CallStatus.CONNECTED)
    }

    @Test
    fun `reconnecting maps to RECONNECTING`() {
        assertThat(CallPresenter.statusOf(CallState.Reconnecting(attempt = 2)))
            .isEqualTo(CallStatus.RECONNECTING)
    }

    @Test
    fun `ended maps to ENDED`() {
        assertThat(CallPresenter.statusOf(CallState.Ended(CallEndReason.Local)))
            .isEqualTo(CallStatus.ENDED)
    }

    @Test
    fun `peer identity and video flag come from config`() {
        val ui = present(CallState.Connected)
        assertThat(ui.peerName).isEqualTo("Alice")
        assertThat(ui.isVideoCall).isTrue()
    }

    @Test
    fun `mute reflects media intent`() {
        assertThat(present(CallState.Connected, media = CallMedia(isMuted = true)).isMuted).isTrue()
        assertThat(present(CallState.Connected, media = CallMedia(isMuted = false)).isMuted).isFalse()
    }

    @Test
    fun `camera is on only for a video call with camera enabled`() {
        assertThat(present(CallState.Connected, media = CallMedia(isCameraOn = true)).isCameraOn).isTrue()
    }

    @Test
    fun `camera is off when the camera intent is disabled even on a video call`() {
        assertThat(present(CallState.Connected, media = CallMedia(isCameraOn = false)).isCameraOn).isFalse()
    }

    @Test
    fun `camera is off for an audio-only call regardless of the camera intent`() {
        val audio = config.copy(isVideo = false)
        assertThat(present(CallState.Connected, config = audio, media = CallMedia(isCameraOn = true)).isCameraOn)
            .isFalse()
    }

    @Test
    fun `end reason is exposed only for a terminated call`() {
        assertThat(present(CallState.Ended(CallEndReason.Missed)).endReason).isEqualTo(CallEndReason.Missed)
        assertThat(present(CallState.Connected).endReason).isNull()
    }

    @Test
    fun `reconnect attempt is exposed while reconnecting and zero otherwise`() {
        assertThat(present(CallState.Reconnecting(attempt = 3)).reconnectAttempt).isEqualTo(3)
        assertThat(present(CallState.Connected).reconnectAttempt).isEqualTo(0)
    }

    @Test
    fun `answer controls show only for an incoming call`() {
        assertThat(present(CallState.Ringing(isOutgoing = false)).showAnswerControls).isTrue()
        assertThat(present(CallState.Ringing(isOutgoing = true)).showAnswerControls).isFalse()
        assertThat(present(CallState.Connected).showAnswerControls).isFalse()
    }

    @Test
    fun `hang-up shows for every live non-incoming phase and hides otherwise`() {
        assertThat(present(CallState.Ringing(isOutgoing = true)).showHangUp).isTrue()
        assertThat(present(CallState.Offering).showHangUp).isTrue()
        assertThat(present(CallState.Connecting).showHangUp).isTrue()
        assertThat(present(CallState.Connected).showHangUp).isTrue()
        assertThat(present(CallState.Reconnecting(attempt = 1)).showHangUp).isTrue()

        assertThat(present(CallState.Ringing(isOutgoing = false)).showHangUp).isFalse()
        assertThat(present(CallState.Idle).showHangUp).isFalse()
        assertThat(present(CallState.Ended(CallEndReason.Local)).showHangUp).isFalse()
    }

    @Test
    fun `media toggles are allowed only once media is being negotiated`() {
        assertThat(present(CallState.Connecting).canToggleMedia).isTrue()
        assertThat(present(CallState.Connected).canToggleMedia).isTrue()
        assertThat(present(CallState.Reconnecting(attempt = 1)).canToggleMedia).isTrue()

        assertThat(present(CallState.Ringing(isOutgoing = true)).canToggleMedia).isFalse()
        assertThat(present(CallState.Ringing(isOutgoing = false)).canToggleMedia).isFalse()
        assertThat(present(CallState.Idle).canToggleMedia).isFalse()
        assertThat(present(CallState.Ended(CallEndReason.Local)).canToggleMedia).isFalse()
    }

    @Test
    fun `is active for every live phase and inactive for idle or ended`() {
        assertThat(present(CallState.Ringing(isOutgoing = true)).isActive).isTrue()
        assertThat(present(CallState.Connected).isActive).isTrue()
        assertThat(present(CallState.Idle).isActive).isFalse()
        assertThat(present(CallState.Ended(CallEndReason.Remote)).isActive).isFalse()
    }

    @Test
    fun `is ended only in the terminal phase`() {
        assertThat(present(CallState.Ended(CallEndReason.Remote)).isEnded).isTrue()
        assertThat(present(CallState.Connected).isEnded).isFalse()
    }
}
