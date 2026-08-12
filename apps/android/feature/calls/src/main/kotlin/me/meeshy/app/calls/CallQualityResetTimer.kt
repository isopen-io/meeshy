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
 * A seam over the peer-quality indicator's auto-reset window: [countdown] emits
 * exactly once, after the silence timeout, while it is collected. iOS clears
 * `isRemoteQualityDegraded` 15 s after the last `call:quality-alert` — sustained
 * poor conditions keep restarting the window, so the indicator stays up exactly
 * as long as alerts keep arriving; the [CallViewModel] treats a single emission
 * as that silence elapsing.
 *
 * Isolating it behind an interface keeps the auto-reset behaviour driven by a
 * deterministic, injectable source in unit tests (same rationale as
 * [CallWaitingTimer] — no wall-clock `delay`, no virtual-time bookkeeping).
 */
interface CallQualityResetTimer {
    fun countdown(): Flow<Unit>
}

/** Production timer: emits once after the real 15 s silence window elapses. */
@Singleton
class RealCallQualityResetTimer @Inject constructor() : CallQualityResetTimer {
    override fun countdown(): Flow<Unit> = flow {
        delay(RESET_AFTER_MS)
        emit(Unit)
    }

    private companion object {
        /** Matches the iOS `QualityThresholds.remoteQualityResetSeconds` 15 s window. */
        const val RESET_AFTER_MS = 15_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallQualityResetTimerModule {
    @Binds
    fun bindCallQualityResetTimer(impl: RealCallQualityResetTimer): CallQualityResetTimer
}
