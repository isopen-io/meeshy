package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshyKitInkColors

/** Les quatre tailles du billet : héros, rangée de liste, compact (un rail), mini (vertical, pour un rail). */
public enum class MeeshyTicketSize { Hero, Row, Compact, Mini }

/** Les genres : normal, brouillon (se met à jour à la saisie), fantôme (dit ce qui manque), barré (terminal), chargement. */
public enum class MeeshyTicketKind { Normal, Draft, Ghost, Struck, Loading }

/** Le rôle du fond : relevé, éclairci à l'appui, ou absent (le fantôme). */
public enum class MeeshyTicketFill { Raised, Field, None }

@Immutable
public data class MeeshyTicketValues(
    val size: MeeshyTicketSize,
    val kind: MeeshyTicketKind,
    val cut: Double,
    val cornerRadius: Double,
    val notchDiameter: Double,
    val dashLineWidth: Double,
    val dashPattern: List<Double>,
    val cutMargin: Double,
    val codeFontSize: Double,
    val pastilleSize: Double,
    val glyphSize: Double,
    val width: Double?,
    val scale: Double,
    val tilt: Double,
    val lift: Double,
    val borderWidth: Double,
    val isBorderDashed: Boolean,
    val fill: MeeshyTicketFill,
    val isStruck: Boolean,
    val showsContent: Boolean,
    val showsBack: Boolean,
    val flipRotation: Double,
    val flipCrossfades: Boolean,
)

/**
 * **La recette de K30 en valeurs** : la coupe par taille, la découpe, les polices, les états (pressé, survolé, soulevé,
 * sélectionné), le retournement et l'encre de la pastille choisie au contraste. Jumeau iOS : `MeeshyTicketRecipe`.
 */
public object MeeshyTicketRecipe {
    public const val CORNER_RADIUS: Double = 22.0
    public const val NOTCH_DIAMETER: Double = 18.0
    public const val DASH_LINE_WIDTH: Double = 1.5
    public const val CUT_MARGIN: Double = 16.0
    public const val FLIP_CROSSFADE_MILLIS: Int = 160
    public const val PRESSED_SCALE: Double = 0.97
    public const val DRAGGING_SCALE: Double = 1.03
    public const val DRAGGING_TILT: Double = 2.5
    public const val HOVER_LIFT: Double = 4.0
    public const val SELECTED_BORDER_WIDTH: Double = 2.0
    public const val REST_BORDER_WIDTH: Double = 1.0
    public const val FLIP_LIFT: Double = 1.05
    public val DARK_INK: Color = MeeshyKitInkColors.TicketDarkInk
    public val DASH_PATTERN: List<Double> = listOf(6.0, 4.0)

    @Suppress("LongParameterList")
    public fun resolve(
        size: MeeshyTicketSize,
        kind: MeeshyTicketKind = MeeshyTicketKind.Normal,
        isSelected: Boolean = false,
        isPressed: Boolean = false,
        isHovered: Boolean = false,
        isDragging: Boolean = false,
        isFlipped: Boolean = false,
        reduceMotion: Boolean = false,
    ): MeeshyTicketValues {
        val isGhost = kind == MeeshyTicketKind.Ghost
        return MeeshyTicketValues(
            size = size,
            kind = kind,
            cut = cut(size),
            cornerRadius = CORNER_RADIUS,
            notchDiameter = NOTCH_DIAMETER,
            dashLineWidth = DASH_LINE_WIDTH,
            dashPattern = DASH_PATTERN,
            cutMargin = CUT_MARGIN,
            codeFontSize = codeFontSize(size),
            pastilleSize = pastilleSize(size),
            glyphSize = if (size == MeeshyTicketSize.Hero) 0.0 else 22.0,
            width = width(size),
            scale = if (isDragging) DRAGGING_SCALE else if (isPressed) PRESSED_SCALE else 1.0,
            tilt = if (isDragging) DRAGGING_TILT else 0.0,
            lift = if (isHovered && !isDragging) HOVER_LIFT else 0.0,
            borderWidth = if (isGhost) DASH_LINE_WIDTH else if (isSelected) SELECTED_BORDER_WIDTH else REST_BORDER_WIDTH,
            isBorderDashed = isGhost,
            fill = if (isGhost) MeeshyTicketFill.None else if (isPressed) MeeshyTicketFill.Field else MeeshyTicketFill.Raised,
            isStruck = kind == MeeshyTicketKind.Struck,
            showsContent = kind != MeeshyTicketKind.Loading,
            showsBack = isFlipped,
            flipRotation = if (isFlipped && !reduceMotion) 180.0 else 0.0,
            flipCrossfades = reduceMotion,
        )
    }

    /** La hauteur du corps, jusqu'au pointillé : 125 en héros, 77 en rangée, 61 en compact. */
    public fun cut(size: MeeshyTicketSize): Double = when (size) {
        MeeshyTicketSize.Hero -> 125.0
        MeeshyTicketSize.Row -> 77.0
        MeeshyTicketSize.Compact -> 61.0
        MeeshyTicketSize.Mini -> 0.0
    }

    public fun codeFontSize(size: MeeshyTicketSize): Double = when (size) {
        MeeshyTicketSize.Hero -> 20.0
        MeeshyTicketSize.Row -> 12.0
        MeeshyTicketSize.Compact -> 11.5
        MeeshyTicketSize.Mini -> 0.0
    }

    public fun pastilleSize(size: MeeshyTicketSize): Double = when (size) {
        MeeshyTicketSize.Hero -> 0.0
        MeeshyTicketSize.Row -> 44.0
        MeeshyTicketSize.Compact, MeeshyTicketSize.Mini -> 36.0
    }

    public fun width(size: MeeshyTicketSize): Double? = when (size) {
        MeeshyTicketSize.Hero, MeeshyTicketSize.Row -> null
        MeeshyTicketSize.Compact -> 150.0
        MeeshyTicketSize.Mini -> 104.0
    }

    /** L'encre de la pastille : l'encre sombre ou le blanc, selon le meilleur contraste sur la teinte reçue. */
    public fun ink(tint: Color): Color = MeeshyKitColor.inkOn(tint, DARK_INK)
}
