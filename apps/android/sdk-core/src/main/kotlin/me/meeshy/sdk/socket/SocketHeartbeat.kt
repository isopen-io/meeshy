package me.meeshy.sdk.socket

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Battement applicatif de la socket (miroir de `SocketHeartbeat.swift`) : un `heartbeat` toutes les 30 s portant
 * `clientTime`, pour que la passerelle calcule le RTT et le rende dans `heartbeat:ack`. Possède sa boucle : une
 * coroutine annulable du [scope] fourni, remplacée à chaque [start] et arrêtée par [stop].
 */
internal class SocketHeartbeat(
    private val scope: CoroutineScope,
    private val intervalMs: Long = INTERVAL_MS,
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
) {
    private var loop: Job? = null

    @Synchronized
    fun start(emit: (clientTimeMs: Long) -> Unit) {
        loop?.cancel()
        loop = scope.launch {
            while (isActive) {
                delay(intervalMs)
                try {
                    emit(nowEpochMs())
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.w(failure, "Socket: heartbeat non emis")
                }
            }
        }
    }

    @Synchronized
    fun stop() {
        loop?.cancel()
        loop = null
    }

    companion object {
        const val INTERVAL_MS: Long = 30_000L
    }
}
