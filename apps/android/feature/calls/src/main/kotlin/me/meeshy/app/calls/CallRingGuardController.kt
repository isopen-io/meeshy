package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallRingGuard
import me.meeshy.sdk.model.call.CallRingGuardPolicy
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/** La couture de la garde de sonnerie : le ViewModel ne connaît que ce contrat. */
interface CallRingGuarding {
    fun attach(host: CallSessionHost)
    fun onTransition(next: CallState)
    fun reset()

    companion object {
        /** Sans garde : le comportement d'avant elle. */
        val Inert: CallRingGuarding = object : CallRingGuarding {
            override fun attach(host: CallSessionHost) = Unit
            override fun onTransition(next: CallState) = Unit
            override fun reset() = Unit
        }
    }
}

/**
 * La garde locale de sonnerie (iOS `CallRingTimeouts`) : armée par la phase, désarmée par toute autre. La
 * passerelle a son propre délai et son `call:ended`, mais un événement perdu laissait l'appel à sonner sans
 * issue — chaque appel suivant se voyait « occupé ». À l'expiration l'appel se range en manqué
 * ([CallEvent.RingTimeout]) ; seul l'appelant le signale à la passerelle, l'appelé ne ferme pas l'appel d'un autre.
 */
class CallRingGuardController @Inject constructor(
    private val signals: CallSignalManager,
) : CallRingGuarding {
    private var host: CallSessionHost? = null
    private var armed: CallRingGuard? = null
    private var job: Job? = null

    override fun attach(host: CallSessionHost) {
        this.host = host
    }

    /** La FSM a bougé : une même garde continue sans repartir (sonnerie puis offre), une autre la remplace. */
    override fun onTransition(next: CallState) {
        val guard = CallRingGuardPolicy.guardFor(next)
        if (guard == armed) return
        stop()
        guard ?: return
        val host = host ?: return
        armed = guard
        job = host.scope.launch {
            delay(guard.timeoutMs)
            expire(host, guard)
        }
    }

    /** Un nouvel appel commence : aucune garde du précédent ne lui survit. */
    override fun reset() = stop()

    private fun expire(host: CallSessionHost, guard: CallRingGuard) {
        armed = null
        job = null
        if (CallRingGuardPolicy.guardFor(host.callState) != guard) return
        host.dispatch(CallEvent.RingTimeout)
        if (guard == CallRingGuard.Outgoing && host.callId.isNotBlank()) signals.emitEnd(host.callId)
        host.endMedia()
    }

    private fun stop() {
        job?.cancel()
        job = null
        armed = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallRingGuardModule {
    @Binds
    fun bindRingGuard(impl: CallRingGuardController): CallRingGuarding
}
