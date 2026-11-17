package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Les trois diamètres du disque d'une grille : 56 serré, 60 par défaut, 64 large. */
public enum class MeeshyLabeledActionSize(public val diameter: Int) { S56(56), S60(60), S64(64) }

/** Ce que la valeur dit : un compte (pilule pleine à l'accent) ou un avis (sourde). */
public enum class MeeshyLabeledActionValueKind { Accent, Quiet }

/** Les colonnes d'une grille : autant que la largeur en loge (jusqu'à `max` sur téléphone), ou un nombre fixe. */
public sealed interface MeeshyActionColumns {
    public data class Adaptive(val max: Int) : MeeshyActionColumns

    public data class Fixed(val count: Int) : MeeshyActionColumns
}

@Immutable
public data class MeeshyLabeledActionValues(
    val kind: MeeshyGlassButtonKind,
    val diameter: Double,
    val glyphSize: Double,
    val faceScale: Double,
    val minTargetWidth: Double,
    val minTargetHeight: Double,
    val labelFontSize: Double,
    val labelGap: Double,
    val valueHeight: Double,
    val valueGap: Double,
    val opacity: Double,
    val glyphOpacity: Double,
    val showsRing: Boolean,
    val isActionable: Boolean,
    val isInDestructiveBand: Boolean,
    val hasValue: Boolean,
)

/**
 * **La recette d'UNE action libellée (K32) en valeurs.** Le disque est celui de K02 (`MeeshyGlassButtonFace`, dessiné à 48) :
 * K32 n'en dessine aucun. Les diamètres 56, 60 et 64 s'obtiennent en mettant le disque de K02 à l'échelle `faceScale`
 * (diamètre / 48), sans toucher à K02. Jumeau iOS : `MeeshyLabeledActionRecipe`.
 */
public object MeeshyLabeledActionRecipe {
    public const val BASE_FACE_DIAMETER: Double = 48.0
    public const val FEATURED_DIAMETER: Double = 96.0
    public const val BAND_DIAMETER: Double = 56.0
    public const val MIN_TARGET_WIDTH: Double = 76.0
    public const val MIN_TARGET_HEIGHT: Double = 88.0
    public const val LABEL_FONT_SIZE: Double = 12.0
    public const val LABEL_GAP: Double = 9.0
    public const val VALUE_HEIGHT: Double = 20.0
    public const val VALUE_GAP: Double = 6.0
    public const val DISABLED_OPACITY: Double = 0.4
    public const val PENDING_GLYPH_OPACITY: Double = 0.45

    @Suppress("LongParameterList")
    public fun resolve(
        kind: MeeshyGlassButtonKind = MeeshyGlassButtonKind.Normal,
        size: MeeshyLabeledActionSize = MeeshyLabeledActionSize.S60,
        isPending: Boolean = false,
        isFeatured: Boolean = false,
        isEnabled: Boolean = true,
        hasValue: Boolean = false,
    ): MeeshyLabeledActionValues {
        val inBand = kind == MeeshyGlassButtonKind.Destructive
        val diameter = if (isFeatured) FEATURED_DIAMETER else if (inBand) BAND_DIAMETER else size.diameter.toDouble()
        return MeeshyLabeledActionValues(
            kind = kind,
            diameter = diameter,
            glyphSize = if (isFeatured) 40.0 else glyphSize(diameter),
            faceScale = diameter / BASE_FACE_DIAMETER,
            minTargetWidth = MIN_TARGET_WIDTH,
            minTargetHeight = MIN_TARGET_HEIGHT,
            labelFontSize = LABEL_FONT_SIZE,
            labelGap = LABEL_GAP,
            valueHeight = VALUE_HEIGHT,
            valueGap = VALUE_GAP,
            opacity = if (isEnabled) 1.0 else DISABLED_OPACITY,
            glyphOpacity = if (isPending) PENDING_GLYPH_OPACITY else 1.0,
            showsRing = isPending,
            isActionable = isEnabled && !isPending,
            isInDestructiveBand = inBand,
            hasValue = hasValue,
        )
    }

    /** Le glyphe : 26, 28 et 30 pour 56, 60 et 64. */
    public fun glyphSize(diameter: Double): Double = when {
        diameter < 58.0 -> 26.0
        diameter < 62.0 -> 28.0
        else -> 30.0
    }
}

@Immutable
public data class MeeshyActionGridValues(
    val columns: Int,
    val columnWidth: Double,
    val minColumn: Double,
    val rows: List<Int>,
    val size: MeeshyLabeledActionSize,
)

/** **La recette de la GRILLE d'actions (K32)** : colonnes, largeur, répartition en rangées (jamais une action seule) et taille du disque. */
public object MeeshyActionGridRecipe {
    public const val MIN_COLUMN: Double = 76.0
    public const val LARGE_TEXT_MIN_COLUMN: Double = 104.0
    public const val LARGE_TEXT_SCALE: Double = 1.6
    public const val COLUMN_GAP: Double = 8.0
    public const val ROW_GAP: Double = 18.0
    public const val PHONE_MAX_COLUMNS: Int = 4
    public const val WIDE_WIDTH: Double = 560.0
    public const val TIGHT_WIDTH: Double = 360.0

    public fun resolve(
        width: Double,
        count: Int,
        columns: MeeshyActionColumns = MeeshyActionColumns.Adaptive(PHONE_MAX_COLUMNS),
        textScale: Double = 1.0,
    ): MeeshyActionGridValues {
        val safeWidth = if (width.isFinite()) maxOf(width, 0.0) else 0.0
        val safeCount = maxOf(count, 0)
        val minimum = if (textScale >= LARGE_TEXT_SCALE) LARGE_TEXT_MIN_COLUMN else MIN_COLUMN
        val fit = maxOf(((safeWidth + COLUMN_GAP) / (minimum + COLUMN_GAP)).toInt(), 1)
        val used = when (columns) {
            is MeeshyActionColumns.Fixed -> maxOf(columns.count, 1)
            is MeeshyActionColumns.Adaptive -> {
                val cap = if (safeWidth >= WIDE_WIDTH) maxOf(safeCount, 1) else maxOf(columns.max, 1)
                maxOf(minOf(fit, cap), 1)
            }
        }
        return MeeshyActionGridValues(
            columns = used,
            columnWidth = (safeWidth - COLUMN_GAP * (used - 1)) / used,
            minColumn = minimum,
            rows = distribute(safeCount, used),
            size = autoSize(safeWidth),
        )
    }

    /** La taille du disque pour la largeur : 56 sous 360, 60 en dessous de 560, 64 au-delà. */
    public fun autoSize(width: Double): MeeshyLabeledActionSize = when {
        width < TIGHT_WIDTH -> MeeshyLabeledActionSize.S56
        width < WIDE_WIDTH -> MeeshyLabeledActionSize.S60
        else -> MeeshyLabeledActionSize.S64
    }

    /** Les rangées : remplies de gauche à droite, sauf si la dernière n'aurait qu'une action — alors le compte se répartit au plus égal. */
    public fun distribute(count: Int, columns: Int): List<Int> {
        if (count <= 0 || columns <= 0) return emptyList()
        val rowCount = (count + columns - 1) / columns
        if (count > 1 && count % columns == 1) {
            val quotient = count / rowCount
            val remainder = count % rowCount
            return List(rowCount) { if (it < remainder) quotient + 1 else quotient }
        }
        return List(rowCount) { if (it < rowCount - 1) columns else count - columns * (rowCount - 1) }
    }
}
