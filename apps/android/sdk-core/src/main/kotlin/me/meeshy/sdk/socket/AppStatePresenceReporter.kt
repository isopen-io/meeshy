package me.meeshy.sdk.socket

import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Déclare l'état foreground/background du process au gateway via
 * `presence:app-state` (CLIENT_EVENTS.PRESENCE_APP_STATE) — le maillon Android
 * manquant du routage sonnerie socket-vs-push (audit appels 2026-07-11 #5).
 *
 * Le gateway ne VoIP-push que les callees NON confirmés foreground
 * (`socket.data.appForeground`, CallEventsHandler) : sans cette émission, un
 * Android app-ouverte-socket-vif recevait le push full-screen EN PLUS de l'UI
 * d'appel entrant in-app — double sonnerie. Miroir de l'émission iOS
 * (`MessageSocketManager.emit("presence:app-state", ...)`).
 *
 * Deux règles, symétriques d'iOS :
 * - **Edge-only** sur [onAppStateChanged] — un état identique répété n'émet pas.
 * - **Replay sur (re)connexion** ([onSocketConnected]) — la donnée serveur est
 *   par-socket ; une socket fraîche ne sait rien tant qu'on ne re-déclare pas.
 *
 * Synchronized : les transitions lifecycle et les callbacks de connexion
 * peuvent arriver sur des threads différents.
 */
@Singleton
class AppStatePresenceReporter @Inject constructor(
    private val socketManager: SocketManager,
) {
    private val lock = Any()
    private var lastForeground: Boolean? = null

    /** Transition foreground/background du process (edge-only). */
    fun onAppStateChanged(foreground: Boolean) = synchronized(lock) {
        if (lastForeground == foreground) return
        lastForeground = foreground
        emit(foreground)
    }

    /** Une socket vient de (re)monter : re-déclare le dernier état connu. */
    fun onSocketConnected() = synchronized(lock) {
        lastForeground?.let(::emit)
    }

    private fun emit(foreground: Boolean) {
        socketManager.emit("presence:app-state", JSONObject().put("foreground", foreground))
    }
}
