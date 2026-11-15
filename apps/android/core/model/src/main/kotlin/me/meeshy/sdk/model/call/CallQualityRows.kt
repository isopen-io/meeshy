package me.meeshy.sdk.model.call

/** Note d'une mesure : Bon, Moyen, Faible ; l'ordre sert à retenir la pire. */
enum class CallQualityGrade { GOOD, MEDIUM, POOR }

/** Les cinq mesures de la feuille de qualité d'appel, dans l'ordre d'affichage. */
enum class CallQualityMetric { PACKET_LOSS, LATENCY, JITTER, AUDIO_RATE, VIDEO_RATE }

/** Une rangée : la mesure, sa valeur brute (pourcent, ms ou kb/s) et sa note (`null` pour les débits). */
data class CallQualityRow(
    val metric: CallQualityMetric,
    val value: Double,
    val grade: CallQualityGrade?,
)

/**
 * Seuils et note globale de la feuille de qualité — port de iOS `CallQualityRows` : perte 3 % / 5 %,
 * latence 300 / 450 ms, gigue 30 / 50 ms vers Moyen / Faible (bornes incluses), les débits n'ont pas
 * de note. Le formatage localisé des valeurs reste à l'écran.
 */
object CallQualityRows {
    fun rows(reading: CallQualityReading?): List<CallQualityRow> {
        if (reading == null) return emptyList()
        return CallQualityMetric.entries.map { metric ->
            val raw = valueOf(metric, reading)
            CallQualityRow(metric, raw, grade(metric, raw))
        }
    }

    fun grade(metric: CallQualityMetric, value: Double): CallQualityGrade? = when (metric) {
        CallQualityMetric.PACKET_LOSS -> ladder(value, medium = 3.0, poor = 5.0)
        CallQualityMetric.LATENCY -> ladder(value, medium = 300.0, poor = 450.0)
        CallQualityMetric.JITTER -> ladder(value, medium = 30.0, poor = 50.0)
        CallQualityMetric.AUDIO_RATE, CallQualityMetric.VIDEO_RATE -> null
    }

    /** La pire des notes, `null` quand aucune rangée n'est notée. */
    fun overall(rows: List<CallQualityRow>): CallQualityGrade? = rows.mapNotNull { it.grade }.maxOrNull()

    private fun ladder(value: Double, medium: Double, poor: Double): CallQualityGrade = when {
        value >= poor -> CallQualityGrade.POOR
        value >= medium -> CallQualityGrade.MEDIUM
        else -> CallQualityGrade.GOOD
    }

    private fun valueOf(metric: CallQualityMetric, reading: CallQualityReading): Double = when (metric) {
        CallQualityMetric.PACKET_LOSS -> reading.packetLossPercent
        CallQualityMetric.LATENCY -> reading.roundTripTimeMs
        CallQualityMetric.JITTER -> reading.jitterMs
        CallQualityMetric.AUDIO_RATE -> reading.audioKbps
        CallQualityMetric.VIDEO_RATE -> reading.videoKbps
    }
}
