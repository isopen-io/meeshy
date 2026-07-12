package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallDuration
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallWaitingState
import me.meeshy.sdk.model.call.ConnectionQuality

/**
 * The coarse phase the call screen renders, derived from the pure
 * [CallState] FSM. Where the FSM distinguishes SDP/ICE substates
 * ([CallState.Offering] vs [CallState.Connecting]) the UI collapses them to a
 * single "connecting" affordance — the caller only cares that media is not yet
 * flowing.
 */
enum class CallStatus {
    /** No call in progress. */
    IDLE,

    /** An incoming call is alerting; the local user may accept or decline. */
    INCOMING,

    /** An outgoing call is placed and waiting for the peer to answer. */
    OUTGOING_RINGING,

    /** Negotiating (offer sent / ICE handshaking); media not yet flowing. */
    CONNECTING,

    /** Connected — media is flowing. */
    CONNECTED,

    /** The media path dropped and an ICE restart is under way. */
    RECONNECTING,

    /** The call has terminated. */
    ENDED,
}

/**
 * Local media intent that rides *alongside* the call phase, never inside the
 * FSM (parity with iOS `CallManager`, where mute/camera are independent of
 * `CallState`). [isCameraOn] is only meaningful for a video call.
 */
data class CallMedia(
    val isMuted: Boolean = false,
    val isCameraOn: Boolean = true,
)

/**
 * The immutable inputs describing *who* and *what kind* of call this is. Fed in
 * from navigation (an outgoing call from chat) or an incoming-call signal.
 *
 * [conversationId] is the room an **outgoing** call is placed into — the payload
 * of the ACK-based `call:initiate` that mints the real server id. [callId] is the
 * id an **incoming** call already carries (from the offer/push that triggered
 * navigation); an outgoing call leaves it blank and receives the minted id from
 * the initiate ACK. Every outbound emit is keyed by whichever id is known.
 */
data class CallConfig(
    val peerId: String,
    val peerName: String,
    val isVideo: Boolean,
    val isOutgoing: Boolean,
    val conversationId: String = "",
    val callId: String = "",
) {
    companion object {
        val EMPTY: CallConfig = CallConfig(peerId = "", peerName = "", isVideo = false, isOutgoing = false)
    }
}

/**
 * What a call-waiting banner renders: a *second* incoming call arrived while this
 * call is active. Presence of this on [CallUiState.waitingBanner] is the sole
 * trigger for the banner surface; `null` = no second call pending.
 */
data class WaitingBannerUi(
    val callerName: String,
    val isVideo: Boolean,
)

/**
 * The single immutable snapshot the call screen renders. Every field is derived
 * — the screen stays pure glue and makes no decisions of its own.
 */
data class CallUiState(
    val status: CallStatus,
    val peerName: String,
    val isVideoCall: Boolean,
    val isMuted: Boolean,
    val isCameraOn: Boolean,
    val endReason: CallEndReason?,
    val reconnectAttempt: Int,
    /**
     * The `M:SS` / `H:MM:SS` call length while media is (or was) flowing —
     * `"0:00"` the instant the call connects, ticking up through a reconnect,
     * and frozen at the final length on the ended screen. `null` before the call
     * ever connects (ringing / connecting) and for a call that ended without ever
     * connecting (missed / declined / failed), where there is nothing to show.
     */
    val durationLabel: String?,
    /**
     * The live connection-quality indicator tier while media is (or is being
     * re-)established — `null` before the call connects, once it ends, and
     * whenever no stats sample has arrived yet (the indicator simply stays
     * hidden). Surfaced only for the connected/reconnecting phases.
     */
    val connectionQuality: ConnectionQuality? = null,
    /**
     * The call-waiting banner for a *second* incoming call that arrived while this
     * one is active — `null` when none is pending. Rendered as a top overlay
     * independent of [status]; the user may reject it or end-this-and-answer it.
     */
    val waitingBanner: WaitingBannerUi? = null,
    /**
     * `true` while the gateway flags the REMOTE peer's sustained bad network
     * (`call:quality-alert`) — "your contact's connection is unstable". Auto-clears
     * after 15 s without a fresh alert (iOS `isRemoteQualityDegraded` parity) and is
     * only surfaced on the media phases.
     */
    val isPeerQualityDegraded: Boolean = false,
    /**
     * `true` while the remote peer is actively screen-capturing this call
     * (`call:screen-capture-alert`) — drives the privacy warning banner (iOS
     * `isRemoteScreenCapturing` parity). Never leaks past the call's media phases.
     */
    val isPeerScreenCapturing: Boolean = false,
    /**
     * The latest live caption from the remote speaker (`call:translated-segment`),
     * preferring the server-side translation over the original text — `null` when
     * captions are quiet or off the media phases.
     */
    val captionText: String? = null,
    /**
     * `true` while the remote peer's microphone is muted (`call:media-toggled`
     * audio) — iOS `isRemoteAudioEnabled` parity. Only on the media phases.
     */
    val isPeerMuted: Boolean = false,
    /**
     * `true` while the remote peer's camera is off DURING A VIDEO CALL
     * (`call:media-toggled` video) — iOS `isRemoteVideoEnabled` parity, driving
     * the "camera off" placeholder. Never raised on an audio-only call.
     */
    val isPeerCameraOff: Boolean = false,
) {
    /** Accept / decline are only offered for an incoming, still-ringing call. */
    val showAnswerControls: Boolean
        get() = status == CallStatus.INCOMING

    /** Hang-up is offered for any live, non-incoming-ringing phase. */
    val showHangUp: Boolean
        get() = when (status) {
            CallStatus.OUTGOING_RINGING,
            CallStatus.CONNECTING,
            CallStatus.CONNECTED,
            CallStatus.RECONNECTING,
            -> true
            else -> false
        }

    /** Mute / camera toggles only make sense once media is being negotiated. */
    val canToggleMedia: Boolean
        get() = when (status) {
            CallStatus.CONNECTING,
            CallStatus.CONNECTED,
            CallStatus.RECONNECTING,
            -> true
            else -> false
        }

    /** True while a call is live (anything but idle or ended). */
    val isActive: Boolean
        get() = status != CallStatus.IDLE && status != CallStatus.ENDED

    val isEnded: Boolean
        get() = status == CallStatus.ENDED
}

/**
 * Pure projection `CallState × CallConfig × CallMedia → CallUiState`. Isolated
 * from the ViewModel and the Composable so every derivation branch is unit
 * tested (TDD-COVERAGE §"UiState derivation").
 */
object CallPresenter {

    fun present(
        state: CallState,
        config: CallConfig,
        media: CallMedia,
        elapsedSeconds: Long = 0,
        connectionQuality: ConnectionQuality? = null,
        waiting: CallWaitingState = CallWaitingState.EMPTY,
        peerQualityDegraded: Boolean = false,
        peerScreenCapturing: Boolean = false,
        caption: String? = null,
        peerAudioEnabled: Boolean = true,
        peerVideoEnabled: Boolean = true,
    ): CallUiState {
        val status = statusOf(state)
        val onMediaPhase = status == CallStatus.CONNECTED || status == CallStatus.RECONNECTING
        return CallUiState(
            status = status,
            peerName = config.peerName,
            isVideoCall = config.isVideo,
            isMuted = media.isMuted,
            isCameraOn = config.isVideo && media.isCameraOn,
            endReason = (state as? CallState.Ended)?.reason,
            reconnectAttempt = (state as? CallState.Reconnecting)?.attempt ?: 0,
            durationLabel = durationLabelFor(status, elapsedSeconds),
            connectionQuality = connectionQualityFor(status, connectionQuality),
            waitingBanner = waiting.pending?.let { WaitingBannerUi(it.callerName, it.isVideo) },
            // Same suppression rule as the quality indicator: a stale peer
            // alert/caption never leaks onto a ringing or ended screen.
            isPeerQualityDegraded = onMediaPhase && peerQualityDegraded,
            isPeerScreenCapturing = onMediaPhase && peerScreenCapturing,
            captionText = caption.takeIf { onMediaPhase },
            isPeerMuted = onMediaPhase && !peerAudioEnabled,
            // Only a VIDEO call renders a camera indicator — an audio call's
            // peer "camera off" is its permanent, unremarkable state.
            isPeerCameraOff = onMediaPhase && config.isVideo && !peerVideoEnabled,
        )
    }

    /**
     * The indicator is meaningful only while media is (or is being re-)negotiated;
     * a stray quality reading from a stale sample never leaks onto a ringing or
     * ended screen.
     */
    private fun connectionQualityFor(
        status: CallStatus,
        quality: ConnectionQuality?,
    ): ConnectionQuality? = when (status) {
        CallStatus.CONNECTED, CallStatus.RECONNECTING -> quality
        else -> null
    }

    /**
     * The timer is live for the connected/reconnecting phases (starting at
     * `"0:00"`), frozen as the final length once ended **iff** the call actually
     * connected (`elapsedSeconds > 0`), and absent otherwise.
     */
    private fun durationLabelFor(status: CallStatus, elapsedSeconds: Long): String? = when (status) {
        CallStatus.CONNECTED, CallStatus.RECONNECTING -> CallDuration.clock(elapsedSeconds)
        CallStatus.ENDED -> if (elapsedSeconds > 0) CallDuration.clock(elapsedSeconds) else null
        else -> null
    }

    fun statusOf(state: CallState): CallStatus = when (state) {
        is CallState.Idle -> CallStatus.IDLE
        is CallState.Ringing -> if (state.isOutgoing) CallStatus.OUTGOING_RINGING else CallStatus.INCOMING
        is CallState.Offering -> CallStatus.CONNECTING
        is CallState.Connecting -> CallStatus.CONNECTING
        is CallState.Connected -> CallStatus.CONNECTED
        is CallState.Reconnecting -> CallStatus.RECONNECTING
        is CallState.Ended -> CallStatus.ENDED
    }
}
