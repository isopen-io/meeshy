package me.meeshy.sdk.model.metrics

import kotlinx.serialization.Serializable

/**
 * Résumé quotidien conservé en local (miroir de `MeeshyMetricsSubscriber.PayloadSummary`). Rien d'utilisateur :
 * des comptes et des durées. [slowFrameRatio] = images lentes / images mesurées (JankStats), nul sans image.
 */
@Serializable
data class PayloadSummary(
    val periodEndEpochMillis: Long,
    val totalFrames: Long = 0,
    val slowFrames: Long = 0,
    val peakMemoryBytes: Long? = null,
    val startupTimeMillis: Long? = null,
    val backgroundExits: BackgroundExitCounts = BackgroundExitCounts.None,
) {
    val slowFrameRatio: Double? get() = if (totalFrames > 0) slowFrames.toDouble() / totalFrames else null

    /** Fusionne deux résumés du MÊME jour : images et sorties s'additionnent, le pic est le maximum. */
    fun mergedWith(other: PayloadSummary): PayloadSummary = PayloadSummary(
        periodEndEpochMillis = maxOf(periodEndEpochMillis, other.periodEndEpochMillis),
        totalFrames = totalFrames + other.totalFrames,
        slowFrames = slowFrames + other.slowFrames,
        peakMemoryBytes = listOfNotNull(peakMemoryBytes, other.peakMemoryBytes).maxOrNull(),
        startupTimeMillis = startupTimeMillis ?: other.startupTimeMillis,
        backgroundExits = backgroundExits + other.backgroundExits,
    )

    companion object {
        const val MAX_RETAINED = 30
        private const val DAY_MILLIS = 86_400_000L

        fun dayOf(epochMillis: Long): Long = Math.floorDiv(epochMillis, DAY_MILLIS)

        /** Ajoute [incoming] (fusion si le jour existe déjà) puis borne aux [limit] plus récents. */
        fun retain(
            stored: List<PayloadSummary>,
            incoming: List<PayloadSummary>,
            limit: Int = MAX_RETAINED,
        ): List<PayloadSummary> {
            val merged = incoming.fold(stored) { acc, item ->
                val index = acc.indexOfFirst { dayOf(it.periodEndEpochMillis) == dayOf(item.periodEndEpochMillis) }
                if (index < 0) acc + item else acc.toMutableList().also { it[index] = it[index].mergedWith(item) }
            }
            return merged.sortedBy { it.periodEndEpochMillis }.takeLast(limit)
        }
    }
}
