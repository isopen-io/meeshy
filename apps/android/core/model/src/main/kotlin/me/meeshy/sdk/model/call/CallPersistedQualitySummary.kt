package me.meeshy.sdk.model.call

/**
 * Le dernier résumé de qualité d'un appel, relisible après un redémarrage (iOS `CallPersistedQualitySummary`) :
 * les dernières statistiques, la durée, le pair et le motif de fin.
 */
data class CallPersistedQualitySummary(
    val callId: String?,
    val remoteUser: String?,
    val durationSeconds: Long,
    val endReason: String,
    val stats: CallStats?,
) {
    companion object {
        fun of(
            stats: CallStats?,
            callId: String?,
            durationSeconds: Long,
            remoteUser: String?,
            reason: CallEndReason,
        ): CallPersistedQualitySummary = CallPersistedQualitySummary(
            callId = callId?.takeIf { it.isNotBlank() },
            remoteUser = remoteUser?.takeIf { it.isNotBlank() },
            durationSeconds = durationSeconds.coerceAtLeast(0),
            endReason = reason.wireValue,
            stats = stats,
        )
    }
}

/** Les dernières statistiques connues d'un appel, lues du dernier relevé de qualité (aucune valeur inventée). */
fun CallQualitySample.toPersistedStats(): CallStats = CallStats(
    roundTripTimeMs = rttMs,
    bandwidth = bytesSent.coerceIn(0, Int.MAX_VALUE.toLong()).toInt(),
    bytesReceived = bytesReceived.coerceIn(0, Int.MAX_VALUE.toLong()).toInt(),
    availableOutgoingBitrateBps = availableOutgoingBitrateBps,
    jitterMs = jitterMs,
)
