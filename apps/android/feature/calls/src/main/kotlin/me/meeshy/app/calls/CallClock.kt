package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over wall-clock time for the call analytics anchors (start →
 * first-connect = `setupTimeMs`, THE setup-regression metric of
 * `call:analytics`). Injectable for the same reason as [CallSecondsTicker]:
 * a test pins the clock and asserts the exact computed delta — no sleeping,
 * no tolerance windows.
 */
interface CallClock {
    fun nowMs(): Long
}

/** Production clock: plain wall time (deltas only — never persisted as an instant). */
@Singleton
class RealCallClock @Inject constructor() : CallClock {
    override fun nowMs(): Long = System.currentTimeMillis()
}

@Module
@InstallIn(SingletonComponent::class)
interface CallClockModule {
    @Binds
    fun bindCallClock(impl: RealCallClock): CallClock
}
