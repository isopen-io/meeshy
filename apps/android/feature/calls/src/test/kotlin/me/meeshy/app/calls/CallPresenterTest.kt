package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallWaitingState
import me.meeshy.sdk.model.call.ConnectionQuality
import me.meeshy.sdk.model.call.WaitingCall
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

    // --- durationLabel ------------------------------------------------------

    @Test
    fun `no duration label before a call ever connects`() {
        assertThat(CallPresenter.present(CallState.Ringing(isOutgoing = true), config, media, 0).durationLabel)
            .isNull()
        assertThat(CallPresenter.present(CallState.Ringing(isOutgoing = false), config, media, 0).durationLabel)
            .isNull()
        assertThat(CallPresenter.present(CallState.Offering, config, media, 0).durationLabel).isNull()
        assertThat(CallPresenter.present(CallState.Connecting, config, media, 0).durationLabel).isNull()
        assertThat(CallPresenter.present(CallState.Idle, config, media, 0).durationLabel).isNull()
    }

    @Test
    fun `connected shows the elapsed clock starting at 0 00`() {
        assertThat(CallPresenter.present(CallState.Connected, config, media, 0).durationLabel).isEqualTo("0:00")
        assertThat(CallPresenter.present(CallState.Connected, config, media, 7).durationLabel).isEqualTo("0:07")
        assertThat(CallPresenter.present(CallState.Connected, config, media, 65).durationLabel).isEqualTo("1:05")
    }

    @Test
    fun `reconnecting keeps showing the running clock`() {
        assertThat(CallPresenter.present(CallState.Reconnecting(attempt = 2), config, media, 42).durationLabel)
            .isEqualTo("0:42")
    }

    @Test
    fun `ended freezes the final length only when the call had connected`() {
        assertThat(CallPresenter.present(CallState.Ended(CallEndReason.Remote), config, media, 125).durationLabel)
            .isEqualTo("2:05")
    }

    @Test
    fun `ended without ever connecting has no duration label`() {
        assertThat(CallPresenter.present(CallState.Ended(CallEndReason.Missed), config, media, 0).durationLabel)
            .isNull()
        assertThat(CallPresenter.present(CallState.Ended(CallEndReason.Rejected), config, media, 0).durationLabel)
            .isNull()
    }

    // --- connectionQuality --------------------------------------------------

    private fun presentQuality(state: CallState, quality: ConnectionQuality?) =
        CallPresenter.present(state, config, media, 0, quality).connectionQuality

    @Test
    fun `connection quality surfaces while connected and reconnecting`() {
        assertThat(presentQuality(CallState.Connected, ConnectionQuality.GOOD))
            .isEqualTo(ConnectionQuality.GOOD)
        assertThat(presentQuality(CallState.Reconnecting(attempt = 1), ConnectionQuality.POOR))
            .isEqualTo(ConnectionQuality.POOR)
    }

    @Test
    fun `connection quality is suppressed off the media phases`() {
        assertThat(presentQuality(CallState.Ringing(isOutgoing = true), ConnectionQuality.EXCELLENT)).isNull()
        assertThat(presentQuality(CallState.Ringing(isOutgoing = false), ConnectionQuality.EXCELLENT)).isNull()
        assertThat(presentQuality(CallState.Offering, ConnectionQuality.EXCELLENT)).isNull()
        assertThat(presentQuality(CallState.Connecting, ConnectionQuality.EXCELLENT)).isNull()
        assertThat(presentQuality(CallState.Idle, ConnectionQuality.EXCELLENT)).isNull()
        assertThat(presentQuality(CallState.Ended(CallEndReason.Remote), ConnectionQuality.EXCELLENT)).isNull()
    }

    @Test
    fun `connection quality is null when no sample has arrived`() {
        assertThat(presentQuality(CallState.Connected, null)).isNull()
    }

    // --- remote alerts (call:quality-alert / call:screen-capture-alert) ------

    private fun presentAlerts(state: CallState, degraded: Boolean = false, capturing: Boolean = false) =
        CallPresenter.present(
            state,
            config,
            media,
            remoteQualityDegraded = degraded,
            remoteScreenCapturing = capturing,
        )

    @Test
    fun `remote alerts surface while connected and reconnecting`() {
        val connected = presentAlerts(CallState.Connected, degraded = true, capturing = true)
        assertThat(connected.remoteQualityDegraded).isTrue()
        assertThat(connected.remoteScreenCapturing).isTrue()

        val reconnecting = presentAlerts(CallState.Reconnecting(attempt = 1), degraded = true, capturing = true)
        assertThat(reconnecting.remoteQualityDegraded).isTrue()
        assertThat(reconnecting.remoteScreenCapturing).isTrue()
    }

    @Test
    fun `remote alerts are suppressed off the media phases`() {
        listOf(
            CallState.Ringing(isOutgoing = true),
            CallState.Ringing(isOutgoing = false),
            CallState.Offering,
            CallState.Connecting,
            CallState.Idle,
            CallState.Ended(CallEndReason.Remote),
        ).forEach { state ->
            val ui = presentAlerts(state, degraded = true, capturing = true)
            assertThat(ui.remoteQualityDegraded).isFalse()
            assertThat(ui.remoteScreenCapturing).isFalse()
        }
    }

    @Test
    fun `remote alerts default to absent`() {
        val ui = presentAlerts(CallState.Connected)
        assertThat(ui.remoteQualityDegraded).isFalse()
        assertThat(ui.remoteScreenCapturing).isFalse()
    }

    // --- waiting banner derivation -----------------------------------------

    private fun presentWaiting(waiting: CallWaitingState) =
        CallPresenter.present(CallState.Connected, config, media, waiting = waiting).waitingBanner

    @Test
    fun `no waiting banner is shown for the empty waiting state`() {
        assertThat(presentWaiting(CallWaitingState.EMPTY)).isNull()
    }

    @Test
    fun `a pending waiting call derives a banner carrying the caller and media`() {
        val waiting = CallWaitingState(
            pending = WaitingCall(callId = "c9", callerId = "u3", callerName = "Carol", isVideo = true),
        )

        val banner = presentWaiting(waiting)

        assertThat(banner).isEqualTo(WaitingBannerUi(callerName = "Carol", isVideo = true))
    }
}
