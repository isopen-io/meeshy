package me.meeshy.sdk.socket

import io.mockk.mockk
import io.mockk.verify
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Behavioural spec du rapporteur `presence:app-state` — le maillon Android
 * manquant du routage sonnerie socket-vs-push (audit appels 2026-07-11 #5).
 *
 * Le gateway ne VoIP-push que les callees NON confirmés foreground
 * (`socket.data.appForeground`, posé par `presence:app-state`). Sans émission
 * Android, un device app-ouverte-socket-vif reçoit QUAND MÊME le push
 * full-screen en plus de l'UI in-app → double sonnerie. Miroir de l'émission
 * iOS (MessageSocketManager) : edge-only sur les transitions, et re-émission
 * de l'état courant sur chaque (re)connexion — la donnée serveur est
 * par-socket, une socket fraîche ne sait rien.
 */
@RunWith(RobolectricTestRunner::class)
class AppStatePresenceReporterTest {

    private fun payloadMatcher(foreground: Boolean): (JSONObject) -> Boolean =
        { it.optBoolean("foreground", !foreground) == foreground }

    @Test
    fun `a foreground transition emits presence app-state true`() {
        val socket: SocketManager = mockk(relaxed = true)
        val reporter = AppStatePresenceReporter(socket)

        reporter.onAppStateChanged(foreground = true)

        verify(exactly = 1) {
            socket.emit("presence:app-state", match(payloadMatcher(true)))
        }
    }

    @Test
    fun `a background transition emits presence app-state false`() {
        val socket: SocketManager = mockk(relaxed = true)
        val reporter = AppStatePresenceReporter(socket)
        reporter.onAppStateChanged(foreground = true)

        reporter.onAppStateChanged(foreground = false)

        verify(exactly = 1) {
            socket.emit("presence:app-state", match(payloadMatcher(false)))
        }
    }

    @Test
    fun `a repeated identical state is edge-only and never re-emits`() {
        val socket: SocketManager = mockk(relaxed = true)
        val reporter = AppStatePresenceReporter(socket)

        reporter.onAppStateChanged(foreground = true)
        reporter.onAppStateChanged(foreground = true)
        reporter.onAppStateChanged(foreground = true)

        verify(exactly = 1) { socket.emit("presence:app-state", any<JSONObject>()) }
    }

    @Test
    fun `a fresh socket connection replays the last known state`() {
        val socket: SocketManager = mockk(relaxed = true)
        val reporter = AppStatePresenceReporter(socket)
        reporter.onAppStateChanged(foreground = true)

        // Reconnexion : la donnée serveur est par-socket, il faut re-déclarer.
        reporter.onSocketConnected()

        verify(exactly = 2) {
            socket.emit("presence:app-state", match(payloadMatcher(true)))
        }
    }

    @Test
    fun `a connection before any known state emits nothing`() {
        val socket: SocketManager = mockk(relaxed = true)
        val reporter = AppStatePresenceReporter(socket)

        reporter.onSocketConnected()

        verify(exactly = 0) { socket.emit(any(), any<JSONObject>()) }
    }
}
