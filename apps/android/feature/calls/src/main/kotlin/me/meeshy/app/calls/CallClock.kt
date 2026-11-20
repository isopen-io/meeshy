package me.meeshy.app.calls

import android.os.SystemClock
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over the two clocks of a call. Injectable for the same reason as
 * [CallSecondsTicker]: a test pins the clock and asserts the exact computed
 * delta — no sleeping, no tolerance windows.
 *
 * [nowMs] is wall time: an epoch instant, as the ongoing-call notification's
 * chronometer needs (`setWhen`). [elapsedMs] is monotonic: it never jumps when
 * the user or NTP resets the wall clock, so a reported delay is measured on it —
 * the analytics anchors (start → first-connect = `setupTimeMs`, THE
 * setup-regression metric of `call:analytics`) read it.
 * Its default falls back to [nowMs] so a pinned test clock serves both.
 */
interface CallClock {
    fun nowMs(): Long
    fun elapsedMs(): Long = nowMs()
}

/** Production clock: wall time for instants, `elapsedRealtime` (monotonic, counts deep sleep) for delays. */
@Singleton
class RealCallClock @Inject constructor() : CallClock {
    override fun nowMs(): Long = System.currentTimeMillis()
    override fun elapsedMs(): Long = SystemClock.elapsedRealtime()
}

@Module
@InstallIn(SingletonComponent::class)
interface CallClockModule {
    @Binds
    fun bindCallClock(impl: RealCallClock): CallClock
}
