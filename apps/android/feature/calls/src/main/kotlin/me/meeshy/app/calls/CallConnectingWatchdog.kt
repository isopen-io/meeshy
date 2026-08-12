package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over the connect-phase watchdog: [countdown] emits exactly once,
 * after the budget, while collected. One continuous window spans the whole
 * Offering∪Connecting stretch (offer sent → media up) — the ONLY uncovered
 * hole left after answering: the server's 60 s ring timeout stops applying
 * once answered, and Android's heartbeats only start in Connected, so an
 * answered call whose ICE never establishes sat on « Connexion… » forever
 * (both sides, until the 2 h GC). iOS bounds the same phase
 * (`connectingFailSeconds`).
 *
 * Injectable for the same reason as [CallReconnectBudget]: the "answered but
 * never connected" rule is asserted through an ordinary flow emission.
 */
interface CallConnectingWatchdog {
    fun countdown(): Flow<Unit>
}

/** Production watchdog: one emission after the real 45 s connect budget. */
@Singleton
class RealCallConnectingWatchdog @Inject constructor() : CallConnectingWatchdog {
    override fun countdown(): Flow<Unit> = flow {
        delay(CONNECT_BUDGET_MS)
        emit(Unit)
    }

    private companion object {
        /**
         * Composition du pire chemin légitime : attente socket cold-start
         * (30 s, CallSignalManager.CONNECT_WAIT_MS) + ACK join (5 s) + marge
         * d'établissement ICE (~10 s). Plus lâche que les 25 s d'iOS parce que
         * la fenêtre Android démarre à l'entrée en Connecting (avant le join),
         * pas après lui — l'intention est identique : borner, jamais optimiser.
         */
        const val CONNECT_BUDGET_MS = 45_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallConnectingWatchdogModule {
    @Binds
    fun bindCallConnectingWatchdog(impl: RealCallConnectingWatchdog): CallConnectingWatchdog
}
