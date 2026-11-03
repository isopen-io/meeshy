package me.meeshy.app.calls

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.call.CallAnalytics
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over the `in_progress` analytics cadence: [beats] emits once per snapshot window while collected.
 * Injectable for the same reason as [CallHeartbeatTicker]: a hard-coded `while (true) delay` on the call scope
 * never ends under a test dispatcher, so `runTest` drained it forever and the JVM died out of memory.
 */
interface CallAnalyticsSnapshotTicker {
    val beats: Flow<Unit>
}

/** Production ticker: one beat per [CallAnalytics.SNAPSHOT_INTERVAL_MS] while collected (iOS cadence parity). */
@Singleton
class RealCallAnalyticsSnapshotTicker @Inject constructor() : CallAnalyticsSnapshotTicker {
    override val beats: Flow<Unit> = flow {
        while (true) {
            delay(CallAnalytics.SNAPSHOT_INTERVAL_MS)
            emit(Unit)
        }
    }
}
