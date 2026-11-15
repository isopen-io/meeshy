package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallConnectedCatchUpPolicy
import me.meeshy.sdk.model.call.CallReliabilityPolicy
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * La fiabilité d'un appel, vue du [CallViewModel] : un seul point d'entrée pour le moniteur périodique, la
 * veille réseau et le drapeau « signalisation dégradée ». Une interface pour que les tests du ViewModel qui ne
 * l'exercent pas gardent l'[Inert].
 */
interface CallReliability {
    /** `true` quand l'appel est établi mais la socket de signalisation est tombée (le média, lui, tient). */
    val signalingDegraded: StateFlow<Boolean>

    fun attach(host: CallSessionHost, media: CallReliabilityMedia)

    /** Rattrapage « connecté » par niveau ; `true` quand la FSM vient de suivre un pair déjà établi. */
    fun catchUpConnected(): Boolean

    fun onTransition(next: CallState)

    /** Un nouvel appel commence : aucune horloge du précédent ne survit. */
    fun reset()

    object Inert : CallReliability {
        override val signalingDegraded: StateFlow<Boolean> = MutableStateFlow(false)
        override fun attach(host: CallSessionHost, media: CallReliabilityMedia) = Unit
        override fun catchUpConnected(): Boolean = false
        override fun onTransition(next: CallState) = Unit
        override fun reset() = Unit
    }
}

/**
 * Le moniteur ([CallReliabilityMonitor]) tourne pendant que l'appel négocie ou qu'il est établi ; la veille
 * réseau ([CallNetworkWatcher]) pendant que le média passe. Chaque arête réseau demande une reconnexion
 * arbitrée ([CallReconnectionTrigger]) : Wi-Fi vers 4G ouvre UN cycle (« Reconnexion… » puis « Connecté »),
 * sans raccrocher, et les arêtes redondantes de la même coupure ne consomment pas le budget.
 */
class CallReliabilityController @Inject constructor(
    private val signals: CallSignalManager,
    private val clock: CallClock,
    private val networkWatcher: CallNetworkWatcher,
) : CallReliability {
    private var host: CallSessionHost? = null
    private var media: CallReliabilityMedia? = null
    private var monitor: CallReliabilityMonitor? = null
    private var monitorJob: Job? = null
    private var networkJob: Job? = null
    private var signalingJob: Job? = null

    private val established = MutableStateFlow(false)
    private val _signalingDegraded = MutableStateFlow(false)
    override val signalingDegraded: StateFlow<Boolean> = _signalingDegraded.asStateFlow()

    override fun attach(host: CallSessionHost, media: CallReliabilityMedia) {
        this.host = host
        this.media = media
        monitor = CallReliabilityMonitor(clock, signals, CallReconnectionTrigger(signals))
        signalingJob?.cancel()
        signalingJob = host.scope.launch {
            combine(established, signals.socketConnected) { call, socket ->
                CallReliabilityPolicy.signalingDegraded(callEstablished = call, socketConnected = socket)
            }.collect { _signalingDegraded.value = it }
        }
    }

    override fun catchUpConnected(): Boolean {
        val host = host ?: return false
        val media = media ?: return false
        if (!CallConnectedCatchUpPolicy.shouldCatchUp(host.callState, media.peerConnected)) return false
        media.catchUpConnected()
        return true
    }

    override fun onTransition(next: CallState) {
        val monitor = monitor ?: return
        monitor.onTransition(next)
        established.value = next is CallState.Connected || next is CallState.Reconnecting
        syncMonitor(next)
        syncNetworkWatch(next)
    }

    override fun reset() {
        stopMonitor()
        stopNetworkWatch()
        established.value = false
    }

    private fun syncMonitor(state: CallState) {
        val supervised = state is CallState.Offering || state is CallState.Connecting ||
            state is CallState.Connected || state is CallState.Reconnecting
        if (!supervised) {
            stopMonitor()
            return
        }
        if (monitorJob?.isActive == true) return
        val host = host ?: return
        val media = media ?: return
        monitorJob = monitor?.start(host, media)
    }

    private fun stopMonitor() {
        monitorJob?.cancel()
        monitorJob = null
    }

    private fun syncNetworkWatch(state: CallState) {
        if (!state.carriesMedia) {
            stopNetworkWatch()
            return
        }
        if (networkJob?.isActive == true) return
        val host = host ?: return
        val media = media ?: return
        val trigger = CallReconnectionTrigger(signals)
        networkJob = host.scope.launch {
            networkWatcher.edges().collect { trigger.request(host, media) }
        }
    }

    private fun stopNetworkWatch() {
        networkJob?.cancel()
        networkJob = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallReliabilityModule {
    @Binds
    fun bindCallReliability(impl: CallReliabilityController): CallReliability
}
