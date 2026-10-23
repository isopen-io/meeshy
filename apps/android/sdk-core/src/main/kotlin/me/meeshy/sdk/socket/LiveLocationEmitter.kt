package me.meeshy.sdk.socket

import me.meeshy.sdk.location.LiveLocationSink
import me.meeshy.sdk.model.LiveLocationDuration
import me.meeshy.sdk.model.LiveLocationEmission
import me.meeshy.sdk.model.LiveLocationFix
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import javax.inject.Inject

/**
 * Émet les trois verbes de la position en direct. Rien ne part hors connexion : rendre `false`
 * laisse l'appelant l'expliquer (une position en direct périmée ne se met pas en file).
 */
class LiveLocationEmitter @Inject constructor(
    private val socketManager: SocketManager,
) : LiveLocationSink {

    override fun start(conversationId: String, fix: LiveLocationFix, duration: LiveLocationDuration): Boolean =
        emitIfConnected(SocketEventNames.LOCATION_LIVE_START, LiveLocationEmission.start(conversationId, fix, duration))

    override fun update(conversationId: String, fix: LiveLocationFix): Boolean =
        emitIfConnected(SocketEventNames.LOCATION_LIVE_UPDATE, LiveLocationEmission.update(conversationId, fix))

    override fun stop(conversationId: String): Boolean =
        emitIfConnected(SocketEventNames.LOCATION_LIVE_STOP, LiveLocationEmission.stop(conversationId))

    private fun emitIfConnected(event: String, fields: Map<String, Any>): Boolean {
        if (socketManager.connectionState.value != SocketConnectionState.CONNECTED) return false
        socketManager.emit(event, JSONObject(fields))
        return true
    }
}
