package me.meeshy.app.calls

import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallMediaTogglePayload
import me.meeshy.sdk.model.call.CallQualityAlertPayload
import me.meeshy.sdk.model.call.CallScreenCaptureAlertPayload
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallTranslatedSegmentPayload
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * What the REMOTE peer is doing to the call, as the gateway reports it. All
 * five default to the quiet state — the peer is assumed to have a good network,
 * no capture, no caption, and an open mic and camera until told otherwise.
 */
data class PeerIndicators(
    /** The peer's sustained bad network (`call:quality-alert`). */
    val qualityDegraded: Boolean = false,
    /** The peer's live screen capture (`call:screen-capture-alert`). */
    val screenCapturing: Boolean = false,
    /** The latest live caption of the peer's speech (`call:translated-segment`). */
    val caption: String? = null,
    /** The peer's mic state (`call:media-toggled` audio). */
    val audioEnabled: Boolean = true,
    /** The peer's camera state (`call:media-toggled` video). */
    val videoEnabled: Boolean = true,
)

/**
 * Owns the peer-facing slice of a call: the [PeerIndicators] the screen shows
 * about the other side, and the one outbound counterpart — relaying the local
 * « this screen is being recorded » edge so the PEER gets the same privacy
 * alert (iOS parity: `UIScreen.capturedDidChangeNotification` →
 * `emitCallScreenCaptureDetected`).
 *
 * Extracted from the [CallViewModel] with no change of behaviour: every inbound
 * alert is gated on the active call's id (a fan-out for another call is inert),
 * each fresh quality alert restarts the 15 s silence window, and every indicator
 * dies with the call so a banner from one call can never leak onto the ended
 * screen or a subsequent call.
 */
class CallPeerIndicatorsController @Inject constructor(
    private val signals: CallSignalManager,
    private val qualityResetTimer: CallQualityResetTimer,
    private val screenRecordingDetector: ScreenRecordingDetector,
) {
    /** The latest snapshot — republished by the host after every change. */
    var indicators: PeerIndicators = PeerIndicators()
        private set

    private var host: CallSessionHost? = null

    /** The 15 s silence window that auto-clears the quality flag; restarted per alert. */
    private var qualityResetJob: Job? = null

    /** Relays local screen-recording edges to the gateway; alive only while media is flowing. */
    private var screenCaptureReportJob: Job? = null

    /**
     * The last capture state actually SENT this call, or `null` when none was.
     * Dedupes the detector's re-emissions AND keeps the initial "not capturing"
     * silent — the peer assumes no capture by default, only edges are news.
     */
    private var lastReportedCapture: Boolean? = null

    /** Start listening to the gateway's peer alerts in the host's scope. */
    fun attach(host: CallSessionHost) {
        this.host = host
        host.scope.launch { signals.qualityAlerts.collect(::onQualityAlert) }
        host.scope.launch { signals.screenCaptureAlerts.collect(::onScreenCaptureAlert) }
        host.scope.launch { signals.translatedSegments.collect(::onTranslatedSegment) }
        host.scope.launch { signals.mediaToggles.collect(::onMediaToggle) }
    }

    /** The FSM moved: run the capture relay while media flows, drop everything once the call is over. */
    fun onTransition(next: CallState) {
        if (next.carriesMedia) startScreenCaptureReportIfNeeded() else stopScreenCaptureReport()
        if (next is CallState.Ended || next is CallState.Idle) clear()
    }

    /** Peer indicators die with the call (and with the pending reset window). */
    fun clear() {
        qualityResetJob?.cancel()
        qualityResetJob = null
        indicators = PeerIndicators()
    }

    /**
     * The gateway flags the REMOTE peer's sustained bad network. Gated on the
     * active call's id; each fresh alert restarts the 15 s silence window, so the
     * indicator stays up exactly as long as alerts keep arriving — iOS
     * `isRemoteQualityDegraded` parity.
     */
    private fun onQualityAlert(alert: CallQualityAlertPayload) {
        val host = host ?: return
        if (host.callId.isBlank() || alert.callId != host.callId) return
        indicators = indicators.copy(qualityDegraded = true)
        host.publish()
        restartQualityResetWindow(host)
    }

    /** The remote peer started/stopped capturing the call — flip the privacy banner. */
    private fun onScreenCaptureAlert(alert: CallScreenCaptureAlertPayload) {
        val host = host ?: return
        if (host.callId.isBlank() || alert.callId != host.callId) return
        indicators = indicators.copy(screenCapturing = alert.isCapturing)
        host.publish()
    }

    /** A live caption landed — prefer the server-side translation over the original. */
    private fun onTranslatedSegment(segment: CallTranslatedSegmentPayload) {
        val host = host ?: return
        if (host.callId.isBlank() || segment.callId != host.callId) return
        indicators = indicators.copy(caption = segment.segment.translatedText ?: segment.segment.text)
        host.publish()
    }

    /**
     * The remote peer muted/unmuted the mic or toggled the camera — flip the
     * matching indicator (iOS `isRemoteAudioEnabled`/`isRemoteVideoEnabled`
     * parity). Gated on the active call's id; an unknown `mediaType` is inert
     * (never a blind flip).
     */
    private fun onMediaToggle(toggle: CallMediaTogglePayload) {
        val host = host ?: return
        if (host.callId.isBlank() || toggle.callId != host.callId) return
        indicators = when (toggle.mediaType) {
            "audio" -> indicators.copy(audioEnabled = toggle.enabled)
            "video" -> indicators.copy(videoEnabled = toggle.enabled)
            else -> return
        }
        host.publish()
    }

    private fun restartQualityResetWindow(host: CallSessionHost) {
        qualityResetJob?.cancel()
        qualityResetJob = host.scope.launch {
            qualityResetTimer.countdown().collect {
                qualityResetJob = null
                indicators = indicators.copy(qualityDegraded = false)
                host.publish()
            }
        }
    }

    private fun startScreenCaptureReportIfNeeded() {
        val host = host ?: return
        if (screenCaptureReportJob != null) return
        screenCaptureReportJob = host.scope.launch {
            screenRecordingDetector.states.collect(::reportScreenCapture)
        }
    }

    /**
     * Edge-only relay: the initial "not capturing" is the peer's default
     * assumption (nothing to say), a repeat changes nothing, and a stop is only
     * news after a reported start. Inert before identification or without a
     * session — the gateway schema requires a non-empty participantId (it
     * resolves the real one server-side, anti-spoofing).
     */
    private fun reportScreenCapture(isCapturing: Boolean) {
        val host = host ?: return
        if (isCapturing == lastReportedCapture) return
        if (!isCapturing && lastReportedCapture == null) return
        if (host.callId.isBlank()) return
        val self = host.selfId
        if (self.isBlank()) return
        lastReportedCapture = isCapturing
        signals.emitScreenCaptureDetected(host.callId, self, isCapturing)
    }

    private fun stopScreenCaptureReport() {
        screenCaptureReportJob?.cancel()
        screenCaptureReportJob = null
        lastReportedCapture = null
    }
}
