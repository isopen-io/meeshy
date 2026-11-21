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
    /** Somme des pertes en FRACTION (0–1), comme [CallQualitySample.packetLoss] : seule l'émission passe en pourcentage. */
    val packetLossSum: Double = 0.0,
    /** La pire perte en FRACTION (0–1) ; émise en pourcentage par [fields]. */
    val maxPacketLoss: Double = 0.0,
    val qualitySampleCounts: Map<ConnectionQuality, Int> = emptyMap(),
    /** Gels, limitation, tampon de gigue, MOS et relais (#19895) : seulement ce qui a été lu. */
    val media: CallMediaTally = CallMediaTally(),
) {
    /** First media-up anchor; idempotent so a reconnect's re-entry never rewrites it. */
    fun connected(nowMs: Long): CallAnalytics =
        if (connectedAtMs != null) this else copy(connectedAtMs = nowMs)

    /** One ICE-restart cycle observed (entry into Reconnecting or a further attempt). */
    fun reconnecting(): CallAnalytics = copy(reconnectionCount = reconnectionCount + 1)

    /**
     * Fold one periodic quality sample into the running aggregates. A non-finite or
     * negative RTT or loss counts as 0 and a loss fraction above 1 as 1 (#19899):
     * one absurd reading must never poison the sums, hence the whole report. The
     * tier keeps reading the raw sample — classification is not this fold's business.
     */
    fun plusSample(sample: CallQualitySample): CallAnalytics {
        val tier = ConnectionQuality.from(sample.level())
        val rttMs = measured(sample.rttMs)
        val lossFraction = minOf(measured(sample.packetLoss), 1.0)
        return copy(
            sampleCount = sampleCount + 1,
            rttSumMs = rttSumMs + rttMs,
            packetLossSum = packetLossSum + lossFraction,
            maxPacketLoss = maxOf(maxPacketLoss, lossFraction),
            qualitySampleCounts = qualitySampleCounts + (tier to ((qualitySampleCounts[tier] ?: 0) + 1)),
            media = sample.media?.let { media.plus(it, sample.jitterMs) } ?: media,
        )
    }

    /**
     * The complete wire payload (minus `callId`, which the transport wrapper
     * adds). `setupTimeMs` is start→first-connect, or `-1` for a call that
     * never connected (missed/rejected/failed setup) — the schema's sentinel
     * for a missing anchor.
     *
     * `averagePacketLoss` and `maxPacketLoss` are PERCENTAGES (0–100), like iOS
     * and the web, from the first build that ships #19896. Builds before it keep
     * emitting a FRACTION (0–1) until updated; the payload carries no app version,
     * so those rows cannot be told apart and are not renormalised server-side.
     * `averageRtt`, `averagePacketLoss` and `maxPacketLoss` are always finite and
     * `>= 0` (`socketCallAnalyticsSchema` requires `nonnegative()`): an overflowing
     * sum is emitted as 0 rather than omitted (#19899).
     */
    fun fields(
        durationSeconds: Long,
        isVideo: Boolean,
        endReason: CallEndReason,
        deviceModel: String,
    ): Map<String, Any> = fields(durationSeconds, isVideo, endReason.wireValue, deviceModel)

    /**
     * L'instantané périodique, NON destructif (iOS `emitCallAnalyticsSnapshot(endReasonLabel: "in_progress")`) : la
     * passerelle écrase la ligne à chaque envoi, donc un kill en arrière-plan ne perd que la dernière fenêtre. Le
     * rapport terminal l'écrase avec la vraie raison.
     */
    fun inProgressFields(durationSeconds: Long, isVideo: Boolean, deviceModel: String): Map<String, Any> =
        fields(durationSeconds, isVideo, IN_PROGRESS_WIRE, deviceModel)

    private fun fields(
        durationSeconds: Long,
        isVideo: Boolean,
        endReasonWire: String,
        deviceModel: String,
    ): Map<String, Any> {
        val averageRttMs = measured(average(rttSumMs))
        val averagePacketLossPercent = measured(average(packetLossSum) * PERCENT)
        return wireFields(durationSeconds, isVideo, endReasonWire, deviceModel, averageRttMs, averagePacketLossPercent) +
            media.fields(averageRttMs = averageRttMs, averagePacketLossPercent = averagePacketLossPercent)
    }

    private fun wireFields(
        durationSeconds: Long,
        isVideo: Boolean,
        endReasonWire: String,
        deviceModel: String,
        averageRttMs: Double,
        averagePacketLossPercent: Double,
    ): Map<String, Any> = mapOf(
        "setupTimeMs" to (connectedAtMs?.let { (it - startedAtMs).coerceAtLeast(0L) } ?: -1L),
        "durationSeconds" to durationSeconds.coerceAtLeast(0L),
        "reconnectionCount" to reconnectionCount,
        "networkTransitions" to 0,
        "averageRtt" to averageRttMs,
        "averagePacketLoss" to averagePacketLossPercent,
        "maxPacketLoss" to measured(maxPacketLoss * PERCENT),
        "codec" to "unknown",
        "effectsUsed" to emptyList<String>(),
        "filtersUsed" to false,
        "transcriptionUsed" to false,
        "qualityDistribution" to qualityDistribution(),
        "platform" to "android",
        "deviceModel" to deviceModel,
        "isVideo" to isVideo,
        "endReason" to endReasonWire,
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

    companion object {
        /** La perte d'un échantillon est une FRACTION ; le rapport et le MOS la lisent en pourcentage, comme iOS et le web. */
        private const val PERCENT: Double = 100.0

        /** Une mesure non finie ou négative compte pour 0 (la jumelle de `nonNegative`, web `call-analytics.ts`). */
        private fun measured(value: Double): Double = if (value.isFinite()) maxOf(value, 0.0) else 0.0

        /** Le `endReason` d'un instantané pris pendant l'appel. */
        const val IN_PROGRESS_WIRE: String = "in_progress"

        /** Cadence des instantanés (iOS `QualityThresholds.analyticsSnapshotIntervalSeconds`). */
        const val SNAPSHOT_INTERVAL_MS: Long = 60_000

        /** Pendant une reconnexion les stats sont gelées (RTT/perte à 0 liraient « excellent ») : la fenêtre est sautée. */
        fun snapshotDue(state: CallState): Boolean = state is CallState.Connected
    }
}
