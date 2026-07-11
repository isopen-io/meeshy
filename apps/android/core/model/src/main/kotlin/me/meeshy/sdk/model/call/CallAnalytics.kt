package me.meeshy.sdk.model.call

/**
 * The lowercase token the `call:analytics` `endReason` field carries on the
 * wire. Spelled out explicitly (never `simpleName`) so a rename can never
 * silently change what the gateway's quality dashboards group by — same rule
 * as [ConnectionQuality.wireValue]. `Failed` deliberately drops its message:
 * the reason is a dimension, not a log line (iOS sends its enum label too).
 */
val CallEndReason.wireValue: String
    get() = when (this) {
        CallEndReason.Local -> "local"
        CallEndReason.Remote -> "remote"
        CallEndReason.Rejected -> "rejected"
        CallEndReason.Missed -> "missed"
        CallEndReason.ConnectionLost -> "connectionLost"
        is CallEndReason.Failed -> "failed"
    }

/**
 * Pure accumulator for the once-per-call `call:analytics` lifecycle telemetry
 * (iOS parity: the `CallManager` analytics accumulators folded by
 * `emitCallAnalyticsSnapshot`). Immutable — every event returns a copy, so the
 * [CallViewModel] folds it exactly like the FSM and a test can assert any
 * intermediate state.
 *
 * [fields] is the single tested SSOT of the wire payload the gateway validates
 * (`socketCallAnalyticsSchema`: every field required). `negotiationTimeMs` is
 * deliberately ABSENT — it is optional server-side and Android has no
 * answer→connected anchor yet; omitting beats sending a fake `-1` anchor.
 * Untracked-on-Android dimensions are reported as their honest zero values
 * (`networkTransitions: 0`, `codec: "unknown"`, no effects/filters/
 * transcription) rather than invented.
 */
data class CallAnalytics(
    val startedAtMs: Long,
    val connectedAtMs: Long? = null,
    val reconnectionCount: Int = 0,
    val sampleCount: Int = 0,
    val rttSumMs: Double = 0.0,
    val packetLossSum: Double = 0.0,
    val maxPacketLoss: Double = 0.0,
    val qualitySampleCounts: Map<ConnectionQuality, Int> = emptyMap(),
) {
    /** First media-up anchor; idempotent so a reconnect's re-entry never rewrites it. */
    fun connected(nowMs: Long): CallAnalytics =
        if (connectedAtMs != null) this else copy(connectedAtMs = nowMs)

    /** One ICE-restart cycle observed (entry into Reconnecting or a further attempt). */
    fun reconnecting(): CallAnalytics = copy(reconnectionCount = reconnectionCount + 1)

    /** Fold one periodic quality sample into the running aggregates. */
    fun plusSample(sample: CallQualitySample): CallAnalytics {
        val tier = ConnectionQuality.from(sample.level())
        return copy(
            sampleCount = sampleCount + 1,
            rttSumMs = rttSumMs + sample.rttMs,
            packetLossSum = packetLossSum + sample.packetLoss,
            maxPacketLoss = maxOf(maxPacketLoss, sample.packetLoss),
            qualitySampleCounts = qualitySampleCounts + (tier to ((qualitySampleCounts[tier] ?: 0) + 1)),
        )
    }

    /**
     * The complete wire payload (minus `callId`, which the transport wrapper
     * adds). `setupTimeMs` is start→first-connect, or `-1` for a call that
     * never connected (missed/rejected/failed setup) — the schema's sentinel
     * for a missing anchor.
     */
    fun fields(
        durationSeconds: Long,
        isVideo: Boolean,
        endReason: CallEndReason,
        deviceModel: String,
    ): Map<String, Any> = mapOf(
        "setupTimeMs" to (connectedAtMs?.let { it - startedAtMs } ?: -1L),
        "durationSeconds" to durationSeconds,
        "reconnectionCount" to reconnectionCount,
        "networkTransitions" to 0,
        "averageRtt" to average(rttSumMs),
        "averagePacketLoss" to average(packetLossSum),
        "maxPacketLoss" to maxPacketLoss,
        "codec" to "unknown",
        "effectsUsed" to emptyList<String>(),
        "filtersUsed" to false,
        "transcriptionUsed" to false,
        "qualityDistribution" to qualityDistribution(),
        "platform" to "android",
        "deviceModel" to deviceModel,
        "isVideo" to isVideo,
        "endReason" to endReason.wireValue,
    )

    private fun average(sum: Double): Double = if (sampleCount > 0) sum / sampleCount else 0.0

    /**
     * Fraction of samples per tier, every tier always present in [0, 1] (the
     * schema requires all four keys). Samples arrive on a fixed cadence, so
     * sample fractions approximate the time fractions iOS reports.
     */
    private fun qualityDistribution(): Map<String, Double> =
        listOf(
            ConnectionQuality.EXCELLENT,
            ConnectionQuality.GOOD,
            ConnectionQuality.FAIR,
            ConnectionQuality.POOR,
        ).associate { tier ->
            tier.wireValue to
                if (sampleCount > 0) (qualitySampleCounts[tier] ?: 0).toDouble() / sampleCount else 0.0
        }
}
