package me.meeshy.sdk.model.metrics

import kotlinx.serialization.Serializable

/** Comptes de sorties de processus par seau ; tout champ a un défaut (ancienne ligne locale tolérée). */
@Serializable
data class BackgroundExitCounts(
    val normal: Int = 0,
    val crash: Int = 0,
    val anrWatchdog: Int = 0,
    val lowMemory: Int = 0,
    val excessiveResources: Int = 0,
    val other: Int = 0,
) {
    /** Sorties NON voulues : tout sauf la sortie normale (miroir de `terminations` côté iOS). */
    val terminations: Int get() = crash + anrWatchdog + lowMemory + excessiveResources + other

    operator fun plus(o: BackgroundExitCounts): BackgroundExitCounts = BackgroundExitCounts(
        normal + o.normal, crash + o.crash, anrWatchdog + o.anrWatchdog,
        lowMemory + o.lowMemory, excessiveResources + o.excessiveResources, other + o.other,
    )

    companion object {
        val None = BackgroundExitCounts()

        fun fromReasons(reasons: Iterable<Int>): BackgroundExitCounts =
            reasons.fold(None) { acc, reason ->
                acc + when (ExitReasonBucket.classify(reason)) {
                    ExitReasonBucket.Normal -> BackgroundExitCounts(normal = 1)
                    ExitReasonBucket.Crash -> BackgroundExitCounts(crash = 1)
                    ExitReasonBucket.AnrWatchdog -> BackgroundExitCounts(anrWatchdog = 1)
                    ExitReasonBucket.LowMemory -> BackgroundExitCounts(lowMemory = 1)
                    ExitReasonBucket.ExcessiveResources -> BackgroundExitCounts(excessiveResources = 1)
                    ExitReasonBucket.Other -> BackgroundExitCounts(other = 1)
                }
            }
    }
}
