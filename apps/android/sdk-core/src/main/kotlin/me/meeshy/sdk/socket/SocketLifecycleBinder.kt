package me.meeshy.sdk.socket

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que le cycle de vie du process commande à la socket ; [SocketManager] l'implémente. */
interface SocketLifecycleTarget {
    val isConnected: Boolean

    /** Ferme le transport (les écouteurs et l'historique de connexion sont gardés). */
    fun suspendForBackground()

    /** Rouvre aussitôt, si un jeton existe. */
    fun resumeFromBackground()

    /** Le réseau est revenu : reconnexion immédiate si la socket est coupée. */
    fun reconnectAfterNetworkRestored()

    /** La socket est tombée pendant un appel : l'échelle reprend la main sans la recréer d'office. */
    fun replanReconnect()
}

/**
 * Pilote la socket depuis le cycle de vie du process et le réseau (miroir de `prepareForBackground` /
 * `resumeFromBackground` / `forceReconnect`, iOS) :
 * - ON_STOP suspend la socket après [backgroundGraceMs] (la livraison passe alors au FCM, ARCHITECTURE.md §7) ;
 * - ON_START la rouvre aussitôt ;
 * - le retour du réseau relance une socket coupée sans attendre l'échelle ;
 * - pendant un appel actif, la socket n'est jamais suspendue ni recréée : la signalisation est conservée, et si
 *   elle est déjà tombée l'échelle est replanifiée.
 */
@Singleton
class SocketLifecycleBinder internal constructor(
    private val target: SocketLifecycleTarget,
    private val callGuard: ActiveCallGuard,
    private val scope: CoroutineScope,
    private val backgroundGraceMs: Long,
) {
    @Inject
    constructor(
        socketManager: SocketManager,
        callGuard: ActiveCallGuard,
        @IoDispatcher dispatcher: CoroutineDispatcher,
    ) : this(socketManager, callGuard, CoroutineScope(SupervisorJob() + dispatcher), BACKGROUND_GRACE_MS)

    @Volatile
    private var foreground = true
    private var pendingSuspend: Job? = null

    @Synchronized
    fun onProcessStop() {
        foreground = false
        pendingSuspend?.cancel()
        pendingSuspend = scope.launch {
            delay(backgroundGraceMs)
            if (!foreground && !callGuard.isCallActive()) target.suspendForBackground()
        }
    }

    @Synchronized
    fun onProcessStart() {
        foreground = true
        pendingSuspend?.cancel()
        pendingSuspend = null
        if (callGuard.isCallActive()) {
            if (!target.isConnected) target.replanReconnect()
        } else {
            target.resumeFromBackground()
        }
    }

    /** Observe le chemin réseau : le passage hors ligne -> en ligne relance une socket coupée. */
    fun bindNetwork(isOnline: Flow<Boolean>) {
        scope.launch {
            var previous: Boolean? = null
            isOnline.collect { online ->
                if (previous == false && online) onNetworkRestored()
                previous = online
            }
        }
    }

    internal fun onNetworkRestored() {
        if (!foreground && !callGuard.isCallActive()) return
        if (!target.isConnected) target.reconnectAfterNetworkRestored()
    }

    companion object {
        const val BACKGROUND_GRACE_MS: Long = 5_000L
    }
}
