package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallAnalytics
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * Owns the once-per-call telemetry behind `call:analytics`: it creates the pure
 * [CallAnalytics] accumulator when a call begins, folds the FSM edges and the
 * quality samples into it, and fires the ONE terminal report on entry into
 * `Ended` (iOS parity: `emitCallAnalyticsSnapshot` at teardown).
 *
 * The accumulator is consumed by the report, so a settle (Ended → Idle) can never
 * re-emit, and an initiate rejected before the ACK minted a call id has nothing
 * the gateway could attach the telemetry to — the report is then dropped.
 *
 * Extracted from the [CallViewModel] with no change of behaviour.
 */
class CallAnalyticsController @Inject constructor(
    private val signals: CallSignalManager,
    private val clock: CallClock,
) {
    private var host: CallSessionHost? = null

    /** `null` before the first call and after the terminal report. */
    private var analytics: CallAnalytics? = null

    fun attach(host: CallSessionHost) {
        this.host = host
    }

    /** A call begins: open a fresh accumulator anchored at now. */
    fun begin() {
        analytics = CallAnalytics(startedAtMs = clock.nowMs())
    }

    /** One live stats tick, folded into the averages and the quality distribution. */
    fun onSample(sample: CallQualitySample) {
        analytics = analytics?.plusSample(sample)
    }

    /** Folds the FSM edge, and reports the call once it ends. */
    fun onTransition(previous: CallState, next: CallState) {
        if (previous !is CallState.Connected && next is CallState.Connected) {
            analytics = analytics?.connected(clock.nowMs())
        }
        if (next is CallState.Reconnecting && previous != next) {
            analytics = analytics?.reconnecting()
        }
        if (previous !is CallState.Ended && next is CallState.Ended) {
            report(next.reason)
        }
    }

    /** Fire-and-forget; inert without a minted call id. */
    private fun report(reason: CallEndReason) {
        val host = host ?: return
        val report = analytics ?: return
        analytics = null
        if (host.callId.isBlank()) return
        signals.emitAnalytics(
            host.callId,
            report.fields(
                durationSeconds = host.elapsedSeconds,
                isVideo = host.config.isVideo,
                endReason = reason,
                deviceModel = deviceModel(),
            ),
        )
    }

    /** `Build.MODEL` is null on plain-JVM unit tests — "unknown" beats a crash. */
    private fun deviceModel(): String =
        runCatching { android.os.Build.MODEL }.getOrNull() ?: "unknown"
}
