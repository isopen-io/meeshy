package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.roundToLong

@Immutable
public data class MeeshyChartPeak(val index: Int, val value: Double)

@Immutable
public data class MeeshyChartSegment(val value: Double, val start: Float, val end: Float, val share: Float)

@Immutable
public data class MeeshyChartDatum(val key: String, val label: String, val value: Double)

/** Un arc d'anneau : 0° en haut, sens horaire. Le tour complet se dessine en deux demi-arcs. */
@Immutable
public data class MeeshyChartArc(
    val startDegrees: Float,
    val sweepDegrees: Float,
    val outerRadius: Float,
    val innerRadius: Float,
    val isFullTurn: Boolean,
)

/**
 * K50 · les mesures pures des graphiques — échelles, graduations, parts, arcs. Aucune dépendance au rendu : tout ce qui se
 * calcule se teste ici, les composants ne font que poser le résultat. Les cinq noms du contrat (`normalized`, `niceTicks`,
 * `peak`, `segments`, `arc`) sont les mêmes sur les trois plateformes.
 */
public object MeeshyChartScale {
    private const val FULL_TURN: Float = 0.9999f

    /** Chaque valeur contre le maximum, de 0 à 1 ; négative ou illisible vaut zéro, une série nulle reste nulle. */
    public fun normalized(values: List<Double>, ceiling: Double? = null): List<Float> {
        val clean = values.map { if (it.isFinite() && it > 0.0) it else 0.0 }
        val top = ceiling ?: (clean.maxOrNull() ?: 0.0)
        return clean.map { if (top <= 0.0) 0f else minOf(it / top, 1.0).toFloat() }
    }

    private fun niceStep(raw: Double): Double {
        val base = 10.0.pow(floor(log10(raw)))
        val fraction = raw / base
        val nice = when {
            fraction <= 1.0 -> 1.0
            fraction <= 2.0 -> 2.0
            fraction <= 5.0 -> 5.0
            else -> 10.0
        }
        return nice * base
    }

    /** Les graduations de 0 à [max] : environ [count] intervalles sur des pas ronds, la dernière couvrant [max]. */
    public fun niceTicks(max: Double, count: Int): List<Double> {
        if (!max.isFinite() || max <= 0.0 || count < 1) return listOf(0.0, 1.0)
        val step = niceStep(max / count)
        val ticks = mutableListOf<Double>()
        var value = 0.0
        while (value < max + step) {
            ticks.add((value * 1e9).roundToLong() / 1e9)
            if (value >= max) break
            value += step
        }
        return ticks
    }

    /** Le point le plus haut — le premier en cas d'égalité ; `null` sans aucun point. */
    public fun peak(values: List<Double>): MeeshyChartPeak? =
        values.foldIndexed<Double, MeeshyChartPeak?>(null) { index, best, value ->
            if (best == null || value > best.value) MeeshyChartPeak(index, value) else best
        }

    /** Les parts d'un tout, bout à bout, en fractions de 0 à 1. Un total nul rend des segments sans largeur. */
    public fun segments(values: List<Double>): List<MeeshyChartSegment> {
        val total = values.sumOf { it.coerceAtLeast(0.0) }
        var cursor = 0f
        return values.map { raw ->
            val value = raw.coerceAtLeast(0.0)
            val share = if (total == 0.0) 0f else (value / total).toFloat()
            MeeshyChartSegment(value, cursor, cursor + share, share).also { cursor += share }
        }
    }

    /** L'arc de [start] à [end] (fractions de tour), de rayon extérieur [radius] et d'épaisseur [thickness]. */
    public fun arc(start: Float, end: Float, radius: Float, thickness: Float): MeeshyChartArc =
        MeeshyChartArc(
            startDegrees = start * 360f,
            sweepDegrees = (end - start) * 360f,
            outerRadius = radius,
            innerRadius = radius - thickness,
            isFullTurn = end - start >= FULL_TURN,
        )

    /** Garde les [limit] premières catégories et replie les suivantes dans UNE catégorie « Autres » (clé `others`). */
    public fun foldIntoOthers(items: List<MeeshyChartDatum>, limit: Int, othersLabel: String): List<MeeshyChartDatum> {
        if (items.size <= limit) return items
        val rest = items.drop(limit).sumOf { it.value }
        return items.take(limit) + MeeshyChartDatum("others", othersLabel, rest)
    }
}
