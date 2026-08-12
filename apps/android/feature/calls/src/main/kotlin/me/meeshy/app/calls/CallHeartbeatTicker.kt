package me.meeshy.app.calls

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over the in-call liveness clock: [beats] emits once per heartbeat
 * period while collected. The [CallViewModel] forwards each beat as a
 * `call:heartbeat` so the gateway can tell a live participant from a zombie —
 * without it, a dead Android device left every call up until the 2 h GC
 * (audit appels 2026-07-11 #5). Injectable seam for the same reason as
 * [CallSecondsTicker]: deterministic flow emissions in unit tests.
 */
interface CallHeartbeatTicker {
    val beats: Flow<Unit>
}

/** Production ticker: one beat per 10 s while collected (iOS cadence parity). */
@Singleton
class RealCallHeartbeatTicker @Inject constructor() : CallHeartbeatTicker {
    override val beats: Flow<Unit> = flow {
        while (true) {
            delay(HEARTBEAT_PERIOD_MS)
            emit(Unit)
        }
    }

    private companion object {
        /** Gateway sizes its 120 s timeout for a 10 s client cadence (CallCleanupService). */
        const val HEARTBEAT_PERIOD_MS = 10_000L
    }
}
