package me.meeshy.sdk.socket

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Les transports démontés, gardés vivants le temps que leurs accusés en attente tombent (miroir de
 * `SocketTransportRetirement.swift`). Le transport retiré perd sa boucle de reconnexion tout de suite
 * ([RealtimeSocket.stopReconnecting]) — sinon il réessaierait sans fin, un fantôme de plus à chaque
 * reconstruction — puis se ferme après [graceMs].
 */
internal class SocketTransportRetirement(
    private val scope: CoroutineScope,
    private val graceMs: Long = GRACE_MS,
) {
    private val retired = mutableListOf<RealtimeSocket>()

    val retiredCount: Int get() = synchronized(retired) { retired.size }

    fun retire(transport: RealtimeSocket?) {
        val retiring = transport ?: return
        retiring.stopReconnecting()
        synchronized(retired) { retired += retiring }
        scope.launch {
            delay(graceMs)
            synchronized(retired) { retired.remove(retiring) }
            retiring.disconnect()
        }
    }

    companion object {
        const val GRACE_MS: Long = 12_000L
    }
}
