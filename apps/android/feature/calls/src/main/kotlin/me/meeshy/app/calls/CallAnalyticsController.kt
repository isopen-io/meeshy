package me.meeshy.app.calls

import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallAnalytics
import me.meeshy.sdk.model.call.CallPersistedQualitySummary
import me.meeshy.sdk.model.call.toPersistedStats
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
    private val summaries: CallQualitySummaryStoring,
    private val snapshotTicker: CallAnalyticsSnapshotTicker,
) {
    private var host: CallSessionHost? = null
    private val quality = CallQualityController(signals)

    /** `null` before the first call and after the terminal report. */
    private var analytics: CallAnalytics? = null

    /** La périodicité `in_progress` (une seule par appel) et la dernière mesure, pour le résumé persisté. */
    private var snapshotJob: Job? = null
    private var lastSample: CallQualitySample? = null

    fun attach(host: CallSessionHost) {
        this.host = host
    }

    /** A call begins: open a fresh accumulator anchored at now. */
    fun begin() {
        analytics = CallAnalytics(startedAtMs = clock.nowMs())
        lastSample = null
        stopSnapshots()
        quality.begin()
    }

    /** One live stats tick, folded into the averages and the quality distribution. */
    fun onSample(sample: CallQualitySample) {
        analytics = analytics?.plusSample(sample)
        lastSample = sample
        host?.let { quality.onSample(it, sample) }
    }

    /** Folds the FSM edge, and reports the call once it ends. */
    fun onTransition(previous: CallState, next: CallState) {
        if (previous !is CallState.Connected && next is CallState.Connected) {
            analytics = analytics?.connected(clock.nowMs())
            startSnapshots()
        }
        if (next is CallState.Reconnecting && previous != next) {
            analytics = analytics?.reconnecting()
        }
        if (previous !is CallState.Ended && next is CallState.Ended) {
            report(next.reason)
        }
    }

    /**
     * Un instantané `in_progress` par minute (iOS `startAnalyticsSnapshots`) : la passerelle écrase la ligne à
     * chaque envoi, donc un kill en arrière-plan ne perd que la dernière fenêtre. Idempotent ; sauté pendant une
     * reconnexion (stats gelées).
     */
    private fun startSnapshots() {
        val host = host ?: return
        if (snapshotJob?.isActive == true) return
        snapshotJob = host.scope.launch {
            snapshotTicker.beats.collect { emitSnapshot(host) }
        }
    }

    private fun emitSnapshot(host: CallSessionHost) {
        if (!CallAnalytics.snapshotDue(host.callState) || host.callId.isBlank()) return
        val current = analytics ?: return
        signals.emitAnalytics(
            host.callId,
            current.inProgressFields(host.elapsedSeconds, host.config.isVideo, deviceModel()),
        )
    }

    private fun stopSnapshots() {
        snapshotJob?.cancel()
        snapshotJob = null
    }

    /** Fire-and-forget; inert without a minted call id. */
    private fun report(reason: CallEndReason) {
        stopSnapshots()
        val host = host ?: return
        persistSummary(host, reason)
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

    /** Le résumé relisible après un redémarrage : écrit à chaque fin, même sans identifiant minté. */
    private fun persistSummary(host: CallSessionHost, reason: CallEndReason) {
        val summary = CallPersistedQualitySummary.of(
            stats = lastSample?.toPersistedStats(),
            callId = host.callId,
            durationSeconds = host.elapsedSeconds,
            remoteUser = host.config.peerName,
            reason = reason,
        )
        host.scope.launch { runCatching { summaries.persist(summary) } }
    }

    /** `Build.MODEL` is null on plain-JVM unit tests — "unknown" beats a crash. */
    private fun deviceModel(): String =
        runCatching { android.os.Build.MODEL }.getOrNull() ?: "unknown"
}
