package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject

/**
 * Émission des signaux d'ACTIVITÉ d'une conversation : la frappe (`typing:*`) et la présence à
 * l'écran (`viewing:*`). Miroir de `MessageSocketManager+ActivitySignals` (iOS).
 *
 * Tout part par [safeEmit] : rien ne part si la socket n'est pas connectée. Un signal d'activité
 * perdu n'a pas de valeur de rejeu (le serveur oublie tout à la déconnexion, l'app ré-annonce à la
 * connexion suivante). Une passerelle ancienne ignore ces événements : aucun risque de rétrocompat.
 */
class ActivitySignalsSocket(private val socketManager: SocketManager) {

    fun emitTypingStart(conversationId: String) = safeEmit(SocketEventNames.TYPING_START, conversationId)

    fun emitTypingStop(conversationId: String) = safeEmit(SocketEventNames.TYPING_STOP, conversationId)

    fun emitViewingStart(conversationId: String) = safeEmit(SocketEventNames.VIEWING_START, conversationId)

    fun emitViewingStop(conversationId: String) = safeEmit(SocketEventNames.VIEWING_STOP, conversationId)

    /** `focus` n'est écrit que lorsqu'il est vrai (charge identique à iOS). */
    fun emitViewingActivity(conversationId: String, focus: Boolean) =
        safeEmit(SocketEventNames.VIEWING_ACTIVITY, conversationId, focus)

    private fun safeEmit(event: String, conversationId: String, focus: Boolean = false) {
        if (!socketManager.isConnected) return
        val payload = JSONObject().put("conversationId", conversationId)
        if (focus) payload.put("focus", true)
        socketManager.emit(event, payload)
    }
}
