package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    private val _foreground = MutableStateFlow<Boolean?>(null)

    /**
     * Dernier état foreground connu (`null` avant la première transition) —
     * observable par le CallViewModel pour les emits per-call
     * `call:backgrounded`/`foregrounded` (grâce heartbeat in-call).
     */
    val foreground: StateFlow<Boolean?> = _foreground.asStateFlow()

    /** Transition foreground/background du process (edge-only). */
    fun onAppStateChanged(foreground: Boolean) = synchronized(lock) {
        if (_foreground.value == foreground) return
        _foreground.value = foreground
        emit(foreground)
    }

    /** Une socket vient de (re)monter : re-déclare le dernier état connu. */
    fun onSocketConnected() = synchronized(lock) {
        _foreground.value?.let(::emit)
    }

    private fun emit(foreground: Boolean) {
        socketManager.emit("presence:app-state", JSONObject().put("foreground", foreground))
    }
}
