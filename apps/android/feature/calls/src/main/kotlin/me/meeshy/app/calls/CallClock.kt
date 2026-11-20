package me.meeshy.app.calls

import android.os.SystemClock
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over WALL-clock time: the instant a user can read (the ongoing-call
 * chronometer's `connectedSinceEpochMs`), plus the short windows that still
 * measure with it. Injectable for the same reason as [CallSecondsTicker]: a test
 * pins the clock — no sleeping, no tolerance windows.
 *
 * Not for the analytics anchors: a wall clock jumps (NTP, manual change, time
 * zone sync), and a jump between two anchors falsifies the delta. Those read
 * [CallElapsedClock].
 */
interface CallClock {
    fun nowMs(): Long
}

/** Production clock: plain wall time. */
@Singleton
class RealCallClock @Inject constructor() : CallClock {
    override fun nowMs(): Long = System.currentTimeMillis()
}

/**
 * A MONOTONIC clock for the call analytics anchors (start → first-connect =
 * `setupTimeMs`, THE setup-regression metric of `call:analytics`). Its value
 * means nothing as an instant — only the difference of two readings does, and
 * that difference never jumps with the wall clock.
 */
fun interface CallElapsedClock {
    fun elapsedMs(): Long
}

/** Production clock: time since boot, deep sleep included (a call can outlive a doze). */
@Singleton
class RealCallElapsedClock @Inject constructor() : CallElapsedClock {
    override fun elapsedMs(): Long = SystemClock.elapsedRealtime()
}

@Module
@InstallIn(SingletonComponent::class)
interface CallClockModule {
    @Binds
    fun bindCallClock(impl: RealCallClock): CallClock

    @Binds
    fun bindCallElapsedClock(impl: RealCallElapsedClock): CallElapsedClock
}
