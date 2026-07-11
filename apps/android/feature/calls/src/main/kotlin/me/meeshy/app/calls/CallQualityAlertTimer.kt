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
 * A seam over the remote-quality alert's auto-clear window: [window] emits
 * exactly once, after the timeout, while it is collected. The gateway re-emits
 * `call:quality-alert` on every sustained degraded report, and each alert
 * re-arms this window — so the "your contact's connection is unstable"
 * indicator stays lit exactly while alerts keep arriving and clears 15 s after
 * the last one (iOS parity: `CallManager.scheduleRemoteQualityReset`).
 *
 * Injectable for the same reason as [CallWaitingTimer]: the auto-clear rule is
 * asserted in unit tests through an ordinary flow emission, no wall-clock.
 */
interface CallQualityAlertTimer {
    fun window(): Flow<Unit>
}

/** Production window: emits once after the real 15 s auto-clear delay. */
@Singleton
class RealCallQualityAlertTimer @Inject constructor() : CallQualityAlertTimer {
    override fun window(): Flow<Unit> = flow {
        delay(AUTO_CLEAR_MS)
        emit(Unit)
    }

    private companion object {
        /** Matches the iOS `QualityThresholds.remoteQualityResetSeconds` (15 s). */
        const val AUTO_CLEAR_MS = 15_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallQualityAlertTimerModule {
    @Binds
    fun bindCallQualityAlertTimer(impl: RealCallQualityAlertTimer): CallQualityAlertTimer
}
