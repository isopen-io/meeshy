package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallSignalMapper
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

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
 * and the WebRTC-plumbing emits (`request-ice-servers`/`heartbeat`/`quality-report`/
 * `reconnecting`/`reconnected`) land with the WebRTC slice.
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

    fun attach() {
        INBOUND_EVENTS.forEach(::listen)
    }

    // --- Outbound emit table (parity with iOS MessageSocketManager) ---

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

    private fun emit(event: String, callId: String) =
        socketManager.emit(event, JSONObject().put("callId", callId))

    private fun listen(event: String) {
        socketManager.on(event) { args ->
            val raw = (args.firstOrNull() as? JSONObject)?.toString() ?: return@on
            CallSignalMapper.map(event, raw)?.let(_events::tryEmit)
        }
    }

    private companion object {
        val INBOUND_EVENTS = listOf(
            "call:initiated",
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
