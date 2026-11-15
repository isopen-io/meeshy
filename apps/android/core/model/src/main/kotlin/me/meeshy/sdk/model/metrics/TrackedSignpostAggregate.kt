package me.meeshy.sdk.model.metrics

import kotlinx.serialization.Serializable

/** Entrée brute d'une section suivie (miroir de `SignpostMetricInput`). */
data class SignpostInput(
    val category: String,
    val name: String,
    val totalCount: Long,
    val cumulativeCpuTimeSeconds: Double?,
    val hitchTimeRatio: Double? = null,
)

/** Agrégat conservé, clé `(category, name)` (miroir de `MeeshyMetricsSubscriber.Aggregate`). */
@Serializable
data class TrackedSignpostAggregate(
    val category: String,
    val name: String,
    val totalCount: Long,
    val cumulativeCpuTimeSeconds: Double? = null,
    val hitchTimeRatio: Double? = null,
    val receivedAtEpochMillis: Long,
) {
    companion object {
        val MediaCategories: Set<String> = setOf("TimelineEngine", "ReelSwitch")

        /** Liste blanche : une catégorie inconnue est ignorée. L'horloge est celle de l'appelant. */
        fun fromInputs(
            inputs: List<SignpostInput>,
            tracked: Set<String>,
            nowEpochMillis: Long,
        ): List<TrackedSignpostAggregate> = inputs.filter { it.category in tracked }.map {
            TrackedSignpostAggregate(
                it.category, it.name, it.totalCount, it.cumulativeCpuTimeSeconds, it.hitchTimeRatio, nowEpochMillis,
            )
        }
    }
}

/**
 * Cumul d'intervalles mesurés d'une section : comptes, temps CPU et taux de hitch = part du temps passée AU-DELÀ
 * du budget d'image ([HITCH_BUDGET_NANOS], 60 Hz).
 */
data class SignpostTally(
    val count: Long = 0,
    val wallNanos: Long = 0,
    val cpuNanos: Long = 0,
    val overBudgetNanos: Long = 0,
) {
    fun record(wallNanos: Long, cpuNanos: Long): SignpostTally = SignpostTally(
        count + 1, this.wallNanos + wallNanos, this.cpuNanos + cpuNanos,
        overBudgetNanos + (wallNanos - HITCH_BUDGET_NANOS).coerceAtLeast(0),
    )

    fun toInput(category: String, name: String): SignpostInput = SignpostInput(
        category, name, count, cpuNanos / 1e9, if (wallNanos > 0) overBudgetNanos.toDouble() / wallNanos else null,
    )

    companion object {
        const val HITCH_BUDGET_NANOS = 16_666_667L
    }
}
