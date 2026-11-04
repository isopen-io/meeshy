package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.model.call.CallRingPlaybackLaw
import me.meeshy.sdk.model.call.CallRingPlaybackLaw.Effect
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.playback.PlaybackDuckLedger
import me.meeshy.sdk.playback.CallHandoff
import me.meeshy.sdk.playback.PlaybackCoordinator
import me.meeshy.sdk.playback.PlaybackVolumeTarget
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que l'appel réclame aux lecteurs : l'arrêt marqué interrompu, puis leur reprise. */
interface CallPlaybackInterruptor {
    fun begin()
    fun end()
}

@Singleton
class HandoffPlaybackInterruptor @Inject constructor(
    private val handoff: CallHandoff,
) : CallPlaybackInterruptor {
    override fun begin() = handoff.onCallStarted()
    override fun end() = handoff.onCallEnded()
}

/**
 * **Un appel Meeshy baisse, arrête puis rend la lecture de Meeshy** (iOS `CallRingPlayback` +
 * `CallPlaybackInterruptionBinding`, #11063 / #8725). La loi [CallRingPlaybackLaw] décide, ce
 * contrôleur applique : la sonnerie baisse les lecteurs audibles, décrocher les arrête (marqués
 * interrompus, ils reprennent au raccrochage) puis rend le volume, refuser le rend sans
 * interrompre. L'interruption des lecteurs à timeline survit au panneau de fin et se lève au
 * retour à Idle. Un appel téléphonique natif reste géré par le focus audio.
 */
@Singleton
class CallPlaybackController @Inject constructor(
    private val playback: PlaybackCoordinator,
    private val interruptor: CallPlaybackInterruptor,
) : CallFeatureController {

    private var ledger = PlaybackDuckLedger<PlaybackVolumeTarget>()
    private var ducked: List<PlaybackVolumeTarget> = emptyList()

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when (CallRingPlaybackLaw.effect(previous, next)) {
            Effect.None -> Unit
            Effect.Duck -> duck()
            Effect.Interrupt -> interruptor.begin()
            Effect.InterruptAndRestore -> {
                interruptor.begin()
                restore()
            }
            Effect.Restore -> restore()
        }
        if (CallRingPlaybackLaw.interruption(next) == false) {
            restore()
            interruptor.end()
        }
    }

    override fun onCleared() {
        restore()
    }

    private fun duck() {
        if (ducked.isNotEmpty()) return
        ledger = PlaybackDuckLedger()
        ducked = playback.audibleVolumeTargets
        ducked.forEach { target -> ledger.duck(target, target.volume)?.let { target.volume = it } }
    }

    private fun restore() {
        ducked.forEach { target -> ledger.restore(target, target.volume)?.let { target.volume = it } }
        ducked = emptyList()
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class CallPlaybackModule {
    @Binds
    abstract fun bindInterruptor(impl: HandoffPlaybackInterruptor): CallPlaybackInterruptor

    @Binds
    @IntoSet
    abstract fun bindController(impl: CallPlaybackController): CallFeatureController
}
