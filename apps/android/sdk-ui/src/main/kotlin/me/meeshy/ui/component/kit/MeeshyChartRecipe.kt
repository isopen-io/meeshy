package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.roundToInt
import kotlin.math.sqrt

public enum class MeeshyChartKind { Bars, Line, Donut, Funnel, Breakdown, Strip, Bubbles }

public enum class MeeshyChartSize { Compact, Regular, Large }

public enum class MeeshyChartLayout { Stacked, Inline }

@Immutable
public data class MeeshyChartValues(
    val kind: MeeshyChartKind,
    val heightDp: Float,
    val barGapDp: Float,
    val isEmpty: Boolean,
    val keepsTrack: Boolean,
    val maxSegments: Int,
    val foldsOthers: Boolean,
    val breakdownBarDp: Float,
    val hasAxis: Boolean,
)

/**
 * K50 · la loi du graphique : une teinte, un pic, deux bornes. Le genre se choisit par la question posée. Le composant
 * montre une série, il ne la calcule pas. Jumeau iOS : `MeeshyChart`.
 */
public object MeeshyChartRecipe {
    public const val HEIGHT_COMPACT_DP: Float = 96f
    public const val HEIGHT_REGULAR_DP: Float = 128f
    public const val HEIGHT_LARGE_DP: Float = 220f
    public const val STRIP_CELL_DP: Float = 26f
    public const val FUNNEL_STAGE_DP: Float = 52f
    public const val DONUT_DP: Float = 104f
    public const val BAR_GAP_TIGHT_DP: Float = 3f
    public const val BAR_GAP_WIDE_DP: Float = 6f
    public const val MAX_SEGMENTS: Int = 5
    public const val STRIP_FLOOR: Float = 0.12f
    public const val BUBBLE_MIN_DP: Int = 34
    public const val BUBBLE_MAX_DP: Int = 78
    public const val LINE_DP: Float = 2.5f
    public const val AREA_OPACITY: Float = 0.15f
    public const val BREAKDOWN_STACKED_DP: Float = 8f
    public const val BREAKDOWN_INLINE_DP: Float = 10f

    private fun height(size: MeeshyChartSize) = when (size) {
        MeeshyChartSize.Compact -> HEIGHT_COMPACT_DP
        MeeshyChartSize.Regular -> HEIGHT_REGULAR_DP
        MeeshyChartSize.Large -> HEIGHT_LARGE_DP
    }

    public fun resolve(
        kind: MeeshyChartKind,
        size: MeeshyChartSize = MeeshyChartSize.Regular,
        pointCount: Int,
        layout: MeeshyChartLayout = MeeshyChartLayout.Stacked,
    ): MeeshyChartValues {
        val count = pointCount.coerceAtLeast(0)
        return MeeshyChartValues(
            kind = kind,
            heightDp = when (kind) {
                MeeshyChartKind.Strip -> STRIP_CELL_DP
                MeeshyChartKind.Funnel -> count * FUNNEL_STAGE_DP
                MeeshyChartKind.Donut -> DONUT_DP
                MeeshyChartKind.Breakdown -> 0f
                else -> height(size)
            },
            barGapDp = if (size == MeeshyChartSize.Large) BAR_GAP_WIDE_DP else BAR_GAP_TIGHT_DP,
            isEmpty = count == 0,
            keepsTrack = kind == MeeshyChartKind.Donut,
            maxSegments = MAX_SEGMENTS,
            foldsOthers = kind == MeeshyChartKind.Donut && count > MAX_SEGMENTS,
            breakdownBarDp = if (layout == MeeshyChartLayout.Inline) BREAKDOWN_INLINE_DP else BREAKDOWN_STACKED_DP,
            hasAxis = kind == MeeshyChartKind.Bars || kind == MeeshyChartKind.Line || kind == MeeshyChartKind.Strip,
        )
    }

    /** L'opacité d'une cellule de bande : la valeur est portée par l'opacité, de 12 à 100 %. */
    public fun stripLevel(fraction: Float): Float {
        val clamped = if (fraction.isNaN()) 0f else fraction.coerceIn(0f, 1f)
        return (((STRIP_FLOOR + (1f - STRIP_FLOOR) * clamped) * 1000f).roundToInt() / 1000f)
    }

    /** Le diamètre d'une bulle : l'aire est proportionnelle à la valeur, de 34 à 78. */
    public fun bubbleDiameter(fraction: Float): Int {
        val clamped = if (fraction.isNaN()) 0f else fraction.coerceIn(0f, 1f)
        val min = BUBBLE_MIN_DP * BUBBLE_MIN_DP
        val max = BUBBLE_MAX_DP * BUBBLE_MAX_DP
        return sqrt(min + (max - min) * clamped).roundToInt()
    }
}
