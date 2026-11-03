package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallEndDecision
import me.meeshy.sdk.model.call.CallEndEmission
import me.meeshy.sdk.model.call.CallPendingEnd
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Émet `call:end` / `call:reject` de façon fiable (iOS `emitCallEndReliably` + réconciliation). Un raccroché que la
 * passerelle ne reçoit jamais laisse le pair dans un appel zombie : socket coupée, la fin est armée dans le
 * [CallPendingEndLedger] et rejouée à la reconnexion ; socket ouverte mais accusé absent, la fin repart et s'arme
 * aussi. La passerelle est idempotente sur `call:end`.
 */
@Singleton
class CallEndReconciler @Inject constructor(
    private val signals: CallSignalManager,
) {
    private val lock = Any()
    private var emission = CallEndEmission()

    /** Les fins encore en attente d'un rejeu (lecture pour les témoins). */
    val pending: List<CallPendingEnd> get() = synchronized(lock) { emission.ledger.pending }

    /** Demande la fin de [callId] : idempotente (une seconde demande est sans effet), raison hors schéma retirée. */
    fun end(callId: String, reason: String? = null) {
        val decision = synchronized(lock) {
            val (decision, next) = emission.request(callId, reason)
            emission = next
            decision
        }
        if (decision is CallEndDecision.Emit) send(decision.callId, decision.reason)
    }

    private fun send(callId: String, reason: String?) {
        if (!signals.isSocketConnected) {
            // Émission au mieux (la socket peut se rouvrir sous la main), puis rejeu garanti à la reconnexion.
            signals.emitEnd(callId, reason)
            arm(callId, reason)
            return
        }
        signals.emitEndAcked(callId, reason) { acked ->
            if (acked) return@emitEndAcked
            signals.emitEnd(callId, reason)
            arm(callId, reason)
        }
    }

    /** La socket est revenue : toutes les fins différées repartent, refus compris, dans l'ordre, une fois chacune. */
    fun onSocketConnected() {
        val entries = synchronized(lock) {
            val (drained, next) = emission.replayOnReconnect()
            emission = next
            drained
        }
        entries.forEach { send(it.callId, it.reason) }
    }

    private fun arm(callId: String, reason: String?) {
        synchronized(lock) { emission = emission.unacknowledged(callId, reason) }
    }
}

/** Rejoue les fins différées à chaque retour de la socket. */
@Singleton
class CallEndReconcilerBinding @Inject constructor(
    private val signals: CallSignalManager,
    private val reconciler: CallEndReconciler,
) : RealtimeBinding {
    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + Dispatchers.Default).also { scope = it }
        live.launch {
            try {
                signals.socketConnected.filter { it }.collect {
                    try {
                        reconciler.onSocketConnected()
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Timber.w(e, "Réconciliation des fins d'appel en échec")
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.w(e, "Réconciliation des fins d'appel interrompue")
            }
        }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class CallEndReconcilerModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: CallEndReconcilerBinding): RealtimeBinding
}
