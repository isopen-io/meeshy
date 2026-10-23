package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.model.call.CallPreviewSignal
import org.json.JSONObject

/**
 * L'aperçu avant décroché, vu du socket : un canal DISTINCT de `call:signal`.
 * Fire-and-forget — une passerelle qui ne connaît pas l'événement l'ignore.
 */
internal class CallPreviewSocket(private val socketManager: SocketManager) {

    fun request(callId: String) =
        socketManager.emit(SocketEventNames.CALL_PREVIEW_REQUEST, JSONObject().put("callId", callId))

    fun signal(signal: CallPreviewSignal) =
        socketManager.emit(SocketEventNames.CALL_PREVIEW_SIGNAL, signalPayload(signal))

    companion object {
        fun signalPayload(signal: CallPreviewSignal): JSONObject {
            val inner = JSONObject()
            signal.signalFields().forEach { (key, value) -> inner.put(key, value ?: JSONObject.NULL) }
            return JSONObject().put("callId", signal.callId).put("signal", inner)
        }
    }
}
