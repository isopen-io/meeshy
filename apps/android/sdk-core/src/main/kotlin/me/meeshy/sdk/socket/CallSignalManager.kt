package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.call.CallEndedSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateAckParser
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallQualityReport
import me.meeshy.sdk.model.call.CallSignalMapper
import me.meeshy.sdk.model.call.WaitingCall
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Subscribes to the call-domain Socket.IO events (ARCHITECTURE.md §3) and mirrors
 * the iOS `MessageSocketManager` call listen/emit tables.
 *
 * **Inbound.** [attach] registers a listener for every `call:*` frame the gateway
 * raises and routes each one through the pure [CallSignalMapper] into the FSM
 * vocabulary; the mapped [CallEvent] is republished on the hot [events] flow that
 * a `CallViewModel` folds. A frame the mapper deems inert (ICE candidates,
 * renegotiation offers, media-toggles) or malformed yields no emission — the
 * manager never decides *which* event a frame is, that decision lives once in the
 * mapper.
 *
 * **Outbound.** The fire-and-forget call-lifecycle emits (`join`/`leave`/`end`/
 * `toggle-audio`/`toggle-video`/`signal`) mirror the iOS payload keys exactly so a
 * rename can never silently break the gateway handler. The ACK-based `call:initiate`
 * mints the real `callId`; the WebRTC-plumbing emits (`request-ice-servers`/
 * `heartbeat`/`quality-report`/`reconnecting`/`reconnected`) drive the gateway's
 * liveness, TURN-refresh, quality-persistence, and reconnect bookkeeping.
 *
 * [events] is a hot [SharedFlow]; late subscribers miss prior events (no replay),
 * matching [MessageSocketManager]/[SocialSocketManager].
 */
@Singleton
class CallSignalManager @Inject constructor(
    private val socketManager: SocketManager,
) {
    private val _events = MutableSharedFlow<CallEvent>(replay = 0, extraBufferCapacity = 64)
    val events: SharedFlow<CallEvent> = _events.asSharedFlow()

    /**
     * The **identity** of each inbound `call:initiated` offer, alongside the
     * FSM-facing [events]. [events] emits an identity-less [CallEvent.ReceiveIncoming];
     * this parallel stream carries the caller + media so a *second* incoming call
     * arriving while a call is already active can be surfaced as a call-waiting
     * banner (and rejected / answered by its own id). Hot, no replay — like [events].
     */
    private val _incomingOffers = MutableSharedFlow<WaitingCall>(replay = 0, extraBufferCapacity = 16)
    val incomingOffers: SharedFlow<WaitingCall> = _incomingOffers.asSharedFlow()

    /**
     * The **identity-carrying** decode of each inbound teardown frame
     * (`call:ended` / `call:missed`): the ended call's id plus the [CallEvent] the
     * FSM reduces iff that id is the *active* call's. This is the **sole** teardown
     * path — [events] deliberately omits `call:ended` / `call:missed` (they route
     * to `null` in [CallSignalMapper.map]) so a teardown is never folded blindly.
     *
     * The gateway fans a `call:ended` out to every member USER room, so a busy
     * user receives the *waiting* call's teardown too; keeping the id here lets the
     * consumer gate the active-call FSM teardown on identity (only the active call's
     * own end reduces it) and merely dismiss the banner when the waiting call ends.
     * Hot, no replay — like [events].
     */
    private val _endedCalls = MutableSharedFlow<CallEndedSignal>(replay = 0, extraBufferCapacity = 16)
    val endedCalls: SharedFlow<CallEndedSignal> = _endedCalls.asSharedFlow()

    fun attach() {
        INBOUND_EVENTS.forEach(::listen)
    }

    // --- Outbound emit table (parity with iOS MessageSocketManager) ---

    /**
     * Places an outgoing call: emits `call:initiate` and awaits the gateway ACK
     * that mints the real [me.meeshy.sdk.model.call.CallInitiateAck] — the
     * MongoDB `callId` every subsequent outbound emit is keyed by, plus the
     * per-user ICE servers WebRTC must be configured with before any SDP offer.
     * Parity with the iOS `emitCallInitiate(conversationId:isVideo:)`.
     *
     * The wire outcome is decided once by the pure [CallInitiateAckParser]; this
     * method only owns the transport (payload keys + the ACK timeout). No ACK
     * within [INITIATE_ACK_TIMEOUT_MS] — or an ACK whose first argument is not a
     * JSON object — yields [CallInitiateResult.Timeout].
     */
    suspend fun emitInitiate(conversationId: String, isVideo: Boolean): CallInitiateResult {
        val payload = JSONObject()
            .put("conversationId", conversationId)
            .put("type", if (isVideo) "video" else "audio")
        val raw = withTimeoutOrNull(INITIATE_ACK_TIMEOUT_MS) {
            suspendCancellableCoroutine { continuation ->
                socketManager.emit("call:initiate", payload) { args ->
                    if (continuation.isActive) {
                        continuation.resume((args.firstOrNull() as? JSONObject)?.toString())
                    }
                }
            }
        }
        return raw?.let(CallInitiateAckParser::parse) ?: CallInitiateResult.Timeout
    }

    /** Join the call room after answering / on reconnect. */
    fun emitJoin(callId: String) = emit("call:join", callId)

    /** Leave the call room without ending the call for the peer. */
    fun emitLeave(callId: String) = emit("call:leave", callId)

    /** End the call for every participant. */
    fun emitEnd(callId: String) = emit("call:end", callId)

    /** Signal the peer that the local microphone was muted/unmuted. */
    fun emitToggleAudio(callId: String, enabled: Boolean) =
        socketManager.emit("call:toggle-audio", JSONObject().put("callId", callId).put("enabled", enabled))

    /** Signal the peer that the local camera was turned off/on. */
    fun emitToggleVideo(callId: String, enabled: Boolean) =
        socketManager.emit("call:toggle-video", JSONObject().put("callId", callId).put("enabled", enabled))

    /** Forward an SDP/ICE [signal] to the peer through the gateway relay. */
    fun emitSignal(callId: String, signal: JSONObject) =
        socketManager.emit("call:signal", JSONObject().put("callId", callId).put("signal", signal))

    // --- WebRTC-plumbing emits (parity with iOS MessageSocketManager) ---

    /**
     * Ask the gateway for fresh ICE (STUN/TURN) servers; it responds out-of-band
     * with `call:ice-servers-refreshed`. Fired on the TURN-credential-TTL refresh
     * timer and on ICE-restart. Parity with iOS `emitRequestIceServers`.
     */
    fun emitRequestIceServers(callId: String) = emit("call:request-ice-servers", callId)

    /**
     * Liveness beat the gateway uses to detect a dead peer (heartbeat timeout →
     * zombie-call cleanup) instead of waiting for the multi-hour GC. Parity with
     * iOS `emitCallHeartbeat` — the gateway resolves the participant from the
     * socket's userId, so no from/to payload is needed.
     */
    fun emitHeartbeat(callId: String) = emit("call:heartbeat", callId)

    /**
     * Report the periodic quality + cumulative data-usage snapshot. The `stats`
     * shape is decided once by the pure [CallQualityReport.statsFields] (iOS parity:
     * base metrics always present, bitrate/jitter only when positive); this method
     * owns only the transport. The last report before teardown carries the call
     * totals the gateway persists on the `CallSession`.
     */
    fun emitQualityReport(callId: String, report: CallQualityReport) =
        socketManager.emit(
            "call:quality-report",
            JSONObject().put("callId", callId).put("stats", JSONObject(report.statsFields())),
        )

    /**
     * Notify the gateway a local ICE restart is in progress (network handoff /
     * connectivity loss) so it marks the call `reconnecting` and suppresses
     * premature cleanup. Parity with iOS `emitCallReconnecting`.
     */
    fun emitReconnecting(callId: String, participantId: String, attempt: Int) =
        socketManager.emit(
            "call:reconnecting",
            JSONObject().put("callId", callId).put("participantId", participantId).put("attempt", attempt),
        )

    /**
     * Notify the gateway the ICE restart completed and the call is active again
     * (resets the call status to `active`). Parity with iOS `emitCallReconnected`.
     */
    fun emitReconnected(callId: String, participantId: String) =
        socketManager.emit(
            "call:reconnected",
            JSONObject().put("callId", callId).put("participantId", participantId),
        )

    private fun emit(event: String, callId: String) =
        socketManager.emit(event, JSONObject().put("callId", callId))

    private fun listen(event: String) {
        socketManager.on(event) { args ->
            val raw = (args.firstOrNull() as? JSONObject)?.toString() ?: return@on
            CallSignalMapper.map(event, raw)?.let(_events::tryEmit)
            if (event == INITIATED_EVENT) {
                CallSignalMapper.incomingOffer(raw)?.let(_incomingOffers::tryEmit)
            }
            CallSignalMapper.endedSignal(event, raw)?.let(_endedCalls::tryEmit)
        }
    }

    private companion object {
        /** Matches the iOS `emitCallInitiate` 10 s ACK budget. */
        const val INITIATE_ACK_TIMEOUT_MS = 10_000L

        /** The single inbound frame that also carries incoming-offer identity. */
        const val INITIATED_EVENT = "call:initiated"

        val INBOUND_EVENTS = listOf(
            INITIATED_EVENT,
            "call:signal",
            "call:participant-joined",
            "call:ended",
            "call:missed",
            "call:media-toggled",
            "call:error",
            "call:already-answered",
        )
    }
}
