package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.model.call.CallControlRefusal
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingRefusal
import org.json.JSONObject

/**
 * Le consentement à l'enregistrement, vu du socket. La passerelle est l'AUTORITÉ ;
 * ce fichier émet les trois verbes (demander, répondre, arrêter) et rend leur accusé.
 */
internal class CallRecordingSocket(private val socketManager: SocketManager) {

    suspend fun request(callId: String, kind: CallRecordingKind): Result<String> =
        emit(SocketEventNames.CALL_RECORDING_REQUEST, requestPayload(callId, kind))

    suspend fun answer(callId: String, recordingId: String, accepted: Boolean): Result<Unit> =
        emit(
            SocketEventNames.CALL_RECORDING_CONSENT,
            JSONObject().put("callId", callId).put("recordingId", recordingId).put("accepted", accepted),
        ).map { }

    suspend fun stop(callId: String, recordingId: String): Result<Unit> =
        emit(SocketEventNames.CALL_RECORDING_STOP, JSONObject().put("callId", callId).put("recordingId", recordingId)).map { }

    private suspend fun emit(event: String, payload: JSONObject): Result<String> =
        ackResult(socketManager.emitForAck(event, payload))

    companion object {
        /** Une passerelle antérieure à #8437 valide en schéma STRICT : l'audio part sans `kind`, seule la vidéo le nomme. */
        fun requestPayload(callId: String, kind: CallRecordingKind): JSONObject =
            JSONObject().put("callId", callId).apply {
                if (kind == CallRecordingKind.VIDEO) put("kind", kind.wire)
            }

        /** `{ success: true, recordingId }` ou `{ success: false, code }` ; tout autre forme est un refus. */
        internal fun ackResult(ack: CallAck): Result<String> = when (ack) {
            CallAck.NoSocket -> Result.failure(CallRecordingRefusal(CallControlRefusal.NO_SOCKET))
            CallAck.TimedOut -> Result.failure(CallRecordingRefusal(CallControlRefusal.TIMEOUT))
            is CallAck.Received -> {
                val body = ack.body
                when {
                    body == null -> Result.failure(CallRecordingRefusal(CallControlRefusal.MALFORMED_ACK))
                    !body.optBoolean("success", false) ->
                        Result.failure(CallRecordingRefusal(body.optString("code").ifBlank { CallControlRefusal.MALFORMED_ACK }))
                    else -> Result.success(body.optString("recordingId"))
                }
            }
        }
    }
}
