package me.meeshy.sdk.model.call.frames

import kotlin.math.ceil

/**
 * Le budget d'une image composée (miroir de iOS `CallLiveFrameBudget`, doc frames 06 § 4) : 0,5 ms pour un cadre
 * léger, 1 ms standard, 2,5 ms riche, mesurés en temps de carte graphique.
 */
public object CallLiveFrameBudget {
    public const val WINDOW_SIZE: Int = 90

    public fun limitMs(cost: CallFrameCost?): Double = when (cost) {
        null, CallFrameCost.LIGHT -> 0.5
        CallFrameCost.STANDARD -> 1.0
        CallFrameCost.RICH -> 2.5
    }

    /** Le 95e centile d'une fenêtre de mesures, `null` si elle est vide. */
    public fun percentile95(samples: List<Double>): Double? {
        if (samples.isEmpty()) return null
        val sorted = samples.sorted()
        val rank = ceil(sorted.size * 0.95).toInt() - 1
        return sorted[rank.coerceIn(0, sorted.lastIndex)]
    }
}

/** Le verdict d'une fenêtre pleine : son p95 et la limite du cadre. */
public data class CallLiveFrameBudgetReport(val p95Ms: Double, val limitMs: Double) {
    val isOverBudget: Boolean get() = p95Ms > limitMs
}

/**
 * Recueille le temps de chaque image et rend le p95 toutes les [CallLiveFrameBudget.WINDOW_SIZE] images
 * (miroir de iOS `CallLiveFrameBudgetMeter`). Pas de fil propre : l'appelant sérialise.
 */
public class CallLiveFrameBudgetMeter(private var limitMs: Double = CallLiveFrameBudget.limitMs(null)) {
    private val samples = ArrayList<Double>(CallLiveFrameBudget.WINDOW_SIZE)

    @Synchronized
    public fun reset(limitMs: Double) {
        this.limitMs = limitMs
        samples.clear()
    }

    /** Une mesure invalide (négative, infinie) est ignorée. Rend le rapport quand la fenêtre se ferme. */
    @Synchronized
    public fun record(ms: Double): CallLiveFrameBudgetReport? {
        if (!ms.isFinite() || ms < 0) return null
        samples += ms
        if (samples.size < CallLiveFrameBudget.WINDOW_SIZE) return null
        val p95 = CallLiveFrameBudget.percentile95(samples.toList())
        samples.clear()
        return p95?.let { CallLiveFrameBudgetReport(it, limitMs) }
    }
}
