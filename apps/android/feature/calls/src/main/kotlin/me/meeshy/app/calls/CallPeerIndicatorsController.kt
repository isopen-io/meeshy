package me.meeshy.app.calls

import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallCaptureKind
import me.meeshy.sdk.model.call.CallDuration
import me.meeshy.sdk.model.call.CallMediaTogglePayload
import me.meeshy.sdk.model.call.CallQualityAlertPayload
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.sdk.model.call.CallScreenCaptureAlertPayload
import me.meeshy.sdk.model.call.CallState
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
    /** The peer's live screen RECORDING (`call:screen-capture-alert`, kind `recording`). */
    val screenCapturing: Boolean = false,
    /** #16665 — a peer SCREENSHOT, shown on the capsule for a short window (no end on the wire). */
    val screenshotFlashing: Boolean = false,
    /** #16665 — who captured last, so the capsule names them in a group. */
    val capturerId: String = "",
    /** #16665 — the captures of the call in progress, dated, for the live journal and the captions band. */
    val liveCaptures: List<CallLiveCapture> = emptyList(),
    /**
     * Retired by #13333: the peer's words are the captions band's (CallCaptionsController), read
     * only while the reader opened them, merged per utterance and resolved through the Prisme.
     */
    val caption: String? = null,
    /** The peer's mic state (`call:media-toggled` audio). */
    val audioEnabled: Boolean = true,
    /** The peer's camera state (`call:media-toggled` video). */
    val videoEnabled: Boolean = true,
    /** The peer shares their screen (`call:media-toggled` screen) — iOS `isRemoteSharing`, #13332. */
    val screenSharing: Boolean = false,
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
    private val screenshotResetTimer: CallScreenshotResetTimer = CallScreenshotResetTimer.Default,
    private val screenshotSignals: CallScreenshotSignals = CallScreenshotSignals.None,
    private val recordingMoments: CallRecordingMoments = CallRecordingMoments.None,
) {
    /** The latest snapshot — republished by the host after every change. */
    var indicators: PeerIndicators = PeerIndicators()
        private set

    private var host: CallSessionHost? = null

    /** The 15 s silence window that auto-clears the quality flag; restarted per alert. */
    private var qualityResetJob: Job? = null

    /** The short window that clears a peer screenshot's capsule; restarted per screenshot. */
    private var screenshotResetJob: Job? = null

    /** Relays local screen-recording edges to the gateway; alive only while media is flowing. */
    private var screenCaptureReportJob: Job? = null

    /** Relays local screenshots to the gateway; alive only while media is flowing. */
    private var screenshotReportJob: Job? = null

    private var captureSequence = 0L

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
        host.scope.launch { signals.mediaToggles.collect(::onMediaToggle) }
        host.scope.launch { recordingMoments.events.collect(::onRecordingMoment) }
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
        screenshotResetJob?.cancel()
        screenshotResetJob = null
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

    /**
     * The remote peer captured the call. A screen RECORDING flips the capsule on and off with its
     * edges; a SCREENSHOT has no end on the wire, so its capsule clears itself after a short window
     * (the `false` the gateway relays for older clients is ignored: it would end a recording). Each
     * START enters the live journal (#16665, loi 13).
     */
    private fun onScreenCaptureAlert(alert: CallScreenCaptureAlertPayload) {
        val host = host ?: return
        if (host.callId.isBlank() || alert.callId != host.callId) return
        val kind = alert.captureKind
        if (kind == CallCaptureKind.RECORDING) {
            indicators = indicators.copy(screenCapturing = alert.isCapturing)
        } else if (alert.isCapturing) {
            indicators = indicators.copy(screenshotFlashing = true)
            restartScreenshotResetWindow(host)
        } else {
            return
        }
        if (alert.isCapturing) {
            val capturer = alert.userId?.takeIf { it.isNotBlank() } ?: alert.participantId.orEmpty()
            indicators = indicators.copy(capturerId = capturer)
            journal(host, "capture:$capturer:${kind.wire}:${captureSequence++}", kind, capturer)
        }
        host.publish()
    }

    /** #16665 — the bounds of the consented call recording enter the live journal. */
    private fun onRecordingMoment(event: CallRecordingSocketEvent) {
        val host = host ?: return
        if (host.callId.isBlank() || event.callId != host.callId) return
        val (id, kind) = CallLiveCaptureJournal.recordingMoment(event) ?: return
        journal(host, id, kind, CallLiveCaptureJournal.recordingAuthor(event))
        host.publish()
    }

    private fun journal(host: CallSessionHost, id: String, kind: CallCaptureKind, userId: String) {
        val capture = CallLiveCapture(
            id = id,
            kind = kind,
            userId = userId,
            atMs = System.currentTimeMillis(),
            elapsedLabel = CallDuration.clock(host.elapsedSeconds),
        )
        indicators = indicators.copy(liveCaptures = CallLiveCaptureJournal.adding(indicators.liveCaptures, capture))
    }

    private fun restartScreenshotResetWindow(host: CallSessionHost) {
        screenshotResetJob?.cancel()
        screenshotResetJob = host.scope.launch {
            screenshotResetTimer.countdown().collect {
                screenshotResetJob = null
                indicators = indicators.copy(screenshotFlashing = false)
                host.publish()
            }
        }
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
        if (host.routesGroupMediaToggle(toggle)) return
        indicators = when (toggle.mediaType) {
            "audio" -> indicators.copy(audioEnabled = toggle.enabled)
            "video" -> indicators.copy(videoEnabled = toggle.enabled)
            "screen" -> indicators.copy(screenSharing = toggle.enabled)
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
        if (screenCaptureReportJob == null) {
            screenCaptureReportJob = host.scope.launch {
                screenRecordingDetector.states.collect(::reportScreenCapture)
            }
        }
        if (screenshotReportJob == null) {
            screenshotReportJob = host.scope.launch {
                screenshotSignals.captures.collect { reportScreenshot() }
            }
        }
    }

    /** #16665 — a screenshot on THIS device during the call: a start, never an end (iOS parity). */
    private fun reportScreenshot() {
        val host = host ?: return
        if (host.callId.isBlank()) return
        val self = host.selfId
        if (self.isBlank()) return
        signals.emitScreenCaptureDetected(host.callId, self, isCapturing = true, kind = CallCaptureKind.SCREENSHOT)
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
        screenshotReportJob?.cancel()
        screenshotReportJob = null
        lastReportedCapture = null
    }
}
