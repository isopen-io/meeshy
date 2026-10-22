package me.meeshy.sdk.model.reading.focal

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class FocalMediaSlot(val width: Float, val height: Float, val overflowCount: Int = 0)

/**
 * Géométrie pure de la grille visuelle d'une rangée plate — miroir de
 * `FocalMediaGridLayout` (iOS). 1 média 300x240; 2 médias 2x(150x180); 3 médias 60/40
 * sur 240; 4+ quadrillage 2x2 de 240 avec le compteur +N sur la dernière cellule.
 */
object FocalMediaGridLayout {
    const val GRID_MAX_WIDTH: Float = 300f
    const val GRID_SPACING: Float = 2f
    const val SOLO_VIDEO_MAX_HEIGHT_RATIO: Float = 1.6f

    /** Vidéo seule : le slot suit le format réel, la hauteur plafonnée à 1.6x la largeur. */
    fun soloVideoSlot(aspectRatio: Float?, maxWidth: Float = GRID_MAX_WIDTH): FocalMediaSlot {
        val ratio = if ((aspectRatio ?: 0f) > 0f) aspectRatio!! else 16f / 9f
        val height = min(maxWidth / ratio, maxWidth * SOLO_VIDEO_MAX_HEIGHT_RATIO)
        val width = min(maxWidth, height * ratio)
        return FocalMediaSlot(roundHalfAway(width), roundHalfAway(height))
    }

    /** Largeur de la grille dans la colonne de contenu réelle (jamais au-delà de 300). */
    fun gridWidth(rowWidth: Float?): Float {
        if (rowWidth == null || rowWidth <= 0f) return GRID_MAX_WIDTH
        val column = rowWidth -
            2 * FocalMetrics.Row.PADDING_HORIZONTAL -
            FocalMetrics.Row.CONTENT_INDENT -
            FocalMetrics.MetaColumn.RESERVED_WIDTH -
            FocalMetrics.MetaColumn.SPACING
        return min(GRID_MAX_WIDTH, floor(max(0f, column)))
    }

    fun slots(count: Int, maxWidth: Float = GRID_MAX_WIDTH): List<FocalMediaSlot> {
        if (count <= 0) return emptyList()
        val half = (maxWidth - GRID_SPACING) / 2
        return when (count) {
            1 -> listOf(FocalMediaSlot(maxWidth, 240f))
            2 -> List(2) { FocalMediaSlot(half, 180f) }
            3 -> {
                val left = (maxWidth - GRID_SPACING) * 0.6f
                val right = (maxWidth - GRID_SPACING) * 0.4f
                listOf(FocalMediaSlot(left, 240f), FocalMediaSlot(right, 240f), FocalMediaSlot(right, 240f))
            }
            else -> List(4) { index ->
                FocalMediaSlot(half, 240f, overflowCount = if (index == 3) count - 4 else 0)
            }
        }
    }

    private fun roundHalfAway(value: Float): Float = value.roundToInt().toFloat()
}
