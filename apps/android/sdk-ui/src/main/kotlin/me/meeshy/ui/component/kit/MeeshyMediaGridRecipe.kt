package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

public enum class MeeshyMediaTileKind { Media, Text, Ghost, Skeleton }

public enum class MeeshyMediaGridLayout { Regular, Masonry, Row }

public enum class MeeshyMediaTileShape { Square, Tall, Free }

public enum class MeeshyMediaGridSpacing { Tight, Regular }

/** La maçonnerie : pour chaque colonne, les rangs des tuiles empilées, et la hauteur de la colonne, écarts compris. */
@Immutable
public data class MeeshyMediaGridPlacement(val columns: List<List<Int>>, val heights: List<Float>)

@Immutable
public data class MeeshyMediaGridValues(
    val layout: MeeshyMediaGridLayout,
    val columns: Int,
    val gapDp: Float,
    val radiusDp: Float,
    val aspect: Float?,
    val isInteractive: Boolean,
    val scale: Float,
    val veil: Float,
    val elevationDp: Float,
    val showsHoverActions: Boolean,
)

/**
 * K49 · la loi de la grille de médias : elle montre, elle ne range rien (aucune coche, aucun « + », aucune poignée).
 * L'image et son cache sont à l'hôte. Jumeau iOS : `MeeshyMediaGrid`.
 */
public object MeeshyMediaGridRecipe {
    public const val MIN_COLUMNS: Int = 2
    public const val MAX_COLUMNS: Int = 3
    public const val GAP_TIGHT_DP: Float = 6f
    public const val GAP_REGULAR_DP: Float = 8f
    public const val WIDE_GAP_DP: Float = 14f
    public const val RADIUS_DP: Float = 18f
    public const val TALL_ASPECT: Float = 2f / 3f
    public const val WIDE_THRESHOLD_DP: Float = 700f
    public const val MIN_ASPECT: Float = 0.5f
    public const val MAX_ASPECT: Float = 2f
    public const val PRESS_SCALE: Float = 0.96f
    public const val PRESS_VEIL: Float = 0.12f
    public const val HOVER_SCALE: Float = 1.025f
    public const val HOVER_ELEVATION_DP: Float = 8f

    public fun columns(columns: Int?): Int = (columns ?: MAX_COLUMNS).coerceIn(MIN_COLUMNS, MAX_COLUMNS)

    /** L'écart entre tuiles : 6 ou 8, et 14 au-delà de 700 de large. */
    public fun spacing(spacing: MeeshyMediaGridSpacing, widthDp: Float): Float = when {
        widthDp > WIDE_THRESHOLD_DP -> WIDE_GAP_DP
        spacing == MeeshyMediaGridSpacing.Tight -> GAP_TIGHT_DP
        else -> GAP_REGULAR_DP
    }

    /** Le rapport d'une tuile libre, borné de 0,5 à 2 ; illisible, il vaut 1. */
    public fun clampedAspect(aspect: Float?): Float =
        if (aspect != null && aspect.isFinite() && aspect > 0f) aspect.coerceIn(MIN_ASPECT, MAX_ASPECT) else 1f

    /** Le rapport largeur sur hauteur d'une tuile : carrée 1, haute 2:3, libre le sien borné. */
    public fun aspectRatio(shape: MeeshyMediaTileShape, aspect: Float?): Float = when (shape) {
        MeeshyMediaTileShape.Square -> 1f
        MeeshyMediaTileShape.Tall -> TALL_ASPECT
        MeeshyMediaTileShape.Free -> clampedAspect(aspect)
    }

    /** Les tuiles posées : la rangée est une seule ligne de colonnes, jamais plus ; les autres dispositions, toutes. */
    public fun visibleCount(count: Int, layout: MeeshyMediaGridLayout, columns: Int?): Int =
        if (layout == MeeshyMediaGridLayout.Row) minOf(count, columns(columns)) else count

    private fun aspectOf(aspect: Float?): Float = clampedAspect(aspect)

    /** Chaque tuile va dans la colonne la plus courte, la première à égalité. Un rapport illisible vaut 1. */
    public fun placement(aspects: List<Float?>, columns: Int, spacingDp: Float, widthDp: Float): MeeshyMediaGridPlacement {
        val count = columns.coerceAtLeast(1)
        val columnWidth = ((widthDp - spacingDp * (count - 1)) / count).coerceAtLeast(0f)
        val lanes = List(count) { mutableListOf<Int>() }
        val heights = FloatArray(count)
        aspects.forEachIndexed { index, aspect ->
            val target = heights.indices.minByOrNull { heights[it] } ?: 0
            lanes[target].add(index)
            heights[target] += (if (heights[target] == 0f) 0f else spacingDp) + columnWidth / aspectOf(aspect)
        }
        return MeeshyMediaGridPlacement(lanes.map { it.toList() }, heights.toList())
    }

    @Suppress("LongParameterList")
    public fun resolve(
        layout: MeeshyMediaGridLayout = MeeshyMediaGridLayout.Regular,
        shape: MeeshyMediaTileShape = MeeshyMediaTileShape.Tall,
        columns: Int? = null,
        spacing: MeeshyMediaGridSpacing = MeeshyMediaGridSpacing.Regular,
        kind: MeeshyMediaTileKind = MeeshyMediaTileKind.Media,
        isPressed: Boolean = false,
        isHovered: Boolean = false,
        isFocused: Boolean = false,
        reduceMotion: Boolean = false,
    ): MeeshyMediaGridValues {
        val isInteractive = kind == MeeshyMediaTileKind.Media || kind == MeeshyMediaTileKind.Text
        val lifted = isInteractive && isHovered
        val pressed = isInteractive && isPressed
        return MeeshyMediaGridValues(
            layout = layout,
            columns = columns(columns),
            gapDp = if (spacing == MeeshyMediaGridSpacing.Tight) GAP_TIGHT_DP else GAP_REGULAR_DP,
            radiusDp = RADIUS_DP,
            aspect = when {
                layout == MeeshyMediaGridLayout.Masonry || shape == MeeshyMediaTileShape.Free -> null
                else -> aspectRatio(shape, null)
            },
            isInteractive = isInteractive,
            scale = when {
                reduceMotion -> 1f
                pressed -> PRESS_SCALE
                lifted -> HOVER_SCALE
                else -> 1f
            },
            veil = if (pressed) PRESS_VEIL else 0f,
            elevationDp = if (lifted) HOVER_ELEVATION_DP else 0f,
            showsHoverActions = isInteractive && (isHovered || isFocused),
        )
    }
}
