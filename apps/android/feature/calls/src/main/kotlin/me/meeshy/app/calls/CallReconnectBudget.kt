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
 * A seam over the per-attempt reconnection budget: [countdown] emits exactly
 * once, after the timeout, while collected. Each `Reconnecting(attempt)` phase
 * arms one window; expiry escalates the FSM (`ReconnectFailed` → next attempt
 * with a fresh ICE-restart nudge, or `Ended(ConnectionLost)` past the budget) —
 * without it a stall that never recovers left the user staring at
 * « Reconnexion… » forever, the server never cleaning up because the socket
 * heartbeats survive the dead media.
 *
 * Injectable for the same reason as [CallWaitingTimer]: the escalation ladder
 * is asserted in unit tests through ordinary flow emissions, no wall-clock.
 */
interface CallReconnectBudget {
    fun countdown(): Flow<Unit>
}

/** Production window: one emission after the real 10 s attempt budget. */
@Singleton
class RealCallReconnectBudget @Inject constructor() : CallReconnectBudget {
    override fun countdown(): Flow<Unit> = flow {
        delay(ATTEMPT_BUDGET_MS)
        emit(Unit)
    }

    private companion object {
        /**
         * Matches the iOS `QualityThresholds.reconnectAttemptBudgetSeconds`
         * (10 s) : backoff + re-gather ICE sur lien faible, sans laisser
         * l'utilisateur bloqué. Avec les 3 tentatives de la FSM, la fenêtre
         * totale est bornée à ~30 s avant `connectionLost`.
         */
        const val ATTEMPT_BUDGET_MS = 10_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallReconnectBudgetModule {
    @Binds
    fun bindCallReconnectBudget(impl: RealCallReconnectBudget): CallReconnectBudget
}
