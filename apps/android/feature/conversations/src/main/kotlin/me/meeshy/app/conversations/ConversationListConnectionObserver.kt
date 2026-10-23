package me.meeshy.app.conversations

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.socket.SocketConnectionState

/**
 * Feeds the connection strip ([ConversationListUiState.banner]) from the socket state AND
 * the device network (parity iOS `ConnectionStatusViewModel`, which reads `NWPathMonitor`
 * before the socket): a cut network reads « Offline », never « Reconnecting… ».
 *
 * It owns the three timers of the iOS banner: the launch grace (the first connection is
 * never announced), the per-drop grace (a reconnection faster than
 * [RECONNECT_GRACE_MILLIS] never shows), and the « online » confirmation, held
 * [BACK_ONLINE_MILLIS] after a down state the user actually saw.
 */
internal class ConversationListConnectionObserver(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<ConversationListUiState>,
    private val connectionState: Flow<SocketConnectionState>,
    private val networkOnline: Flow<Boolean>,
) {
    private var graceJob: Job? = null
    private var backOnlineJob: Job? = null

    /** A down state was on screen since the last time the connection was up (iOS `downWasSurfaced`). */
    private var downSurfaced = false

    fun start() {
        graceJob = scope.launch {
            delay(CONNECTION_GRACE_MILLIS)
            state.update { it.copy(connectionSettled = true) }
        }
        scope.launch {
            combine(connectionState, networkOnline) { connection, online -> connection to online }
                .collect { (connection, online) -> apply(connection, online) }
        }
    }

    private fun apply(connection: SocketConnectionState, online: Boolean) {
        val before = state.value
        if (before.banner.isDown) downSurfaced = true
        val dropped = before.connection == SocketConnectionState.CONNECTED &&
            connection != SocketConnectionState.CONNECTED
        if (connection == SocketConnectionState.CONNECTED) graceJob?.cancel()
        if (dropped) startReconnectGrace()
        state.update {
            it.copy(
                connection = connection,
                isNetworkOnline = online,
                hasConnected = it.hasConnected || connection == SocketConnectionState.CONNECTED,
                connectionSettled = when {
                    connection == SocketConnectionState.CONNECTED -> true
                    dropped -> false
                    else -> it.connectionSettled
                },
            )
        }
        if (state.value.banner.isDown) downSurfaced = true
        val isUp = online && connection == SocketConnectionState.CONNECTED
        when {
            !isUp -> clearBackOnline()
            downSurfaced -> {
                downSurfaced = false
                confirmBackOnline()
            }
        }
    }

    private fun startReconnectGrace() {
        graceJob?.cancel()
        graceJob = scope.launch {
            delay(RECONNECT_GRACE_MILLIS)
            state.update { it.copy(connectionSettled = true) }
        }
    }

    private fun confirmBackOnline() {
        backOnlineJob?.cancel()
        state.update { it.copy(showBackOnline = true) }
        backOnlineJob = scope.launch {
            delay(BACK_ONLINE_MILLIS)
            state.update { it.copy(showBackOnline = false) }
        }
    }

    private fun clearBackOnline() {
        backOnlineJob?.cancel()
        if (state.value.showBackOnline) state.update { it.copy(showBackOnline = false) }
    }

    companion object {
        /** How long the first socket connection may take before the strip announces it. */
        const val CONNECTION_GRACE_MILLIS: Long = 4_000L

        /** A dropped socket back within this window is never announced (iOS `reconnectingGraceDuration`). */
        const val RECONNECT_GRACE_MILLIS: Long = 3_000L

        /** How long « Online » confirms the return (iOS `onlineAckDuration`). */
        const val BACK_ONLINE_MILLIS: Long = 4_000L
    }
}
