package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallTurnCredentialsLaw
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.TurnCredentialsStart
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject
import javax.inject.Singleton

/** Une attente du renouvellement TURN : [after] émet une fois, au bout de `delayMs`, tant qu'on la collecte. */
fun interface CallTurnRefreshTimer {
    fun after(delayMs: Long): Flow<Unit>
}

@Singleton
class RealCallTurnRefreshTimer @Inject constructor() : CallTurnRefreshTimer {
    override fun after(delayMs: Long): Flow<Unit> = flow {
        delay(delayMs)
        emit(Unit)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallTurnRefreshTimerModule {
    @Binds
    fun bindCallTurnRefreshTimer(impl: RealCallTurnRefreshTimer): CallTurnRefreshTimer
}

/**
 * Les identifiants TURN d'un appel en cours (#13773), miroir de iOS `CallTurnCredentials` : à l'échéance
 * ([CallTurnCredentialsLaw.refreshDelayMs], 80 % du TTL servi) l'appel émet `call:request-ice-servers` — la salle est
 * déjà rejointe, jamais avant l'ACK de `call:join` — et arme un chien de garde, la demande n'ayant pas d'ACK : sans
 * réponse en 8 s elle repart, trois fois au plus, puis le cycle suivant s'arme au plancher. La réponse
 * (`call:ice-servers-refreshed`) réarme l'échéance sur son propre TTL ([schedule]). La fin de l'appel coupe tout.
 */
class CallTurnCredentialsController @Inject constructor(
    private val signals: CallSignalManager,
    private val timer: CallTurnRefreshTimer,
) {
    private var host: CallSessionHost? = null
    private var refreshJob: Job? = null
    private var watchdogJob: Job? = null
    private var retryAttempt = 0

    fun attach(host: CallSessionHost) {
        this.host = host
    }

    /** La connexion vient d'être configurée avec [iceServers] : un jeu vide demande tout de suite, sinon l'échéance s'arme. */
    fun afterConfigure(callId: String, iceServers: List<SocketIceServer>, ttlSeconds: Long? = null) {
        when (val start = CallTurnCredentialsLaw.afterConfigure(iceServers, ttlSeconds)) {
            TurnCredentialsStart.RequestNow -> request(callId)
            is TurnCredentialsStart.Schedule -> arm(start.delayMs)
        }
    }

    /** Un jeu servi de durée [ttlSeconds] (`null` : le défaut de la passerelle) : l'échéance repart de zéro. */
    fun schedule(ttlSeconds: Long?) = arm(CallTurnCredentialsLaw.refreshDelayMs(ttlSeconds))

    /** Plus aucune échéance ni relance : l'appel est fini, ou un autre commence. */
    fun cancelAll() {
        refreshJob?.cancel()
        refreshJob = null
        watchdogJob?.cancel()
        watchdogJob = null
        retryAttempt = 0
    }

    private fun arm(delayMs: Long) {
        cancelAll()
        val host = host ?: return
        refreshJob = host.scope.launch {
            timer.after(delayMs).collect {
                val callId = host.callId
                if (host.callState.isActive && callId.isNotBlank()) request(callId)
            }
        }
    }

    private fun request(callId: String) {
        signals.emitRequestIceServers(callId)
        armWatchdog(callId)
    }

    private fun armWatchdog(callId: String) {
        val host = host ?: return
        watchdogJob?.cancel()
        watchdogJob = host.scope.launch {
            timer.after(CallTurnCredentialsLaw.RETRY_TIMEOUT_MS).collect {
                if (!host.callState.isActive || host.callId != callId) return@collect
                retryAttempt += 1
                if (CallTurnCredentialsLaw.shouldRetry(retryAttempt)) request(callId)
                else arm(CallTurnCredentialsLaw.MIN_REFRESH_DELAY_MS)
            }
        }
    }
}
