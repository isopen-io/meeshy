package me.meeshy.sdk.model.reading.focal

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Perspective du fil (Focal), SEULEMENT pendant le défilement : chaque rangée visible reçoit une
 * échelle et une opacité fonction de sa distance à la ligne de focus (`FocalFocusCurve`, variante
 * fil), une compaction symétrique tire chaque rangée vers la ligne de la hauteur perdue par
 * celles qui l'en séparent, et l'élue grandit dans un cadre qui ouvre un passage à ses voisines.
 * Miroir de `FocalScrollPerspective.swift`, sans le CALayer : la peau Compose applique les
 * nombres rendus ici en `graphicsLayer`, jamais une hauteur ni une police (zéro relayout).
 *
 * Repère VISUEL : y croît vers le bas, 0 en haut de la région considérée.
 */
public object FocalScrollPerspective {

    public const val VISUAL_PIVOT_X: Double = FocalFocusCurve.THREAD_HORIZONTAL_PIVOT

    /** Plancher d'opacité de consommation : une rangée lointaine reste lisible. */
    public const val ALPHA_FLOOR: Double = 0.62

    public const val OVERSCAN_FRACTION: Double = 0.3

    public const val FOCUS_CARD_CORNER_RADIUS: Double = 18.0
    public const val FOCUS_CARD_HORIZONTAL_INSET: Double = 6.0
    public const val FOCUS_CARD_INNER_MARGIN: Double = FocalMetrics.Row.PADDING_VERTICAL

    public const val ELECTED_CARD_MARGIN: Double =
        FocalMetrics.Row.PADDING_HORIZONTAL - FOCUS_CARD_HORIZONTAL_INSET
    public const val ELECTED_CONTENT_BREATHING: Double = FocalMetrics.Row.PADDING_VERTICAL

    public data class Pose(val scale: Double, val alpha: Double) {
        public companion object {
            public val IDENTITY: Pose = Pose(scale = 1.0, alpha = 1.0)
        }
    }

    public fun pose(distance: Double, reduceMotion: Boolean): Pose {
        if (reduceMotion) return Pose.IDENTITY
        val result = FocalFocusCurve.focusCurve(abs(distance), FocalFocusCurve.Variant.THREAD)
        return Pose(scale = result.scale, alpha = max(ALPHA_FLOOR, result.alpha))
    }

    /**
     * Ordonnée de la ligne de focus : le centre de la région visible, sauf près du bas du fil où
     * elle descend au bord bas au repos (le dernier message doit pouvoir être en focus).
     */
    public fun focusY(visibleTop: Double, visibleBottom: Double, offsetFromBottom: Double): Double {
        val center = (visibleTop + visibleBottom) / 2
        val travel = visibleBottom - center
        if (travel <= 0) return center
        val t = min(1.0, max(0.0, offsetFromBottom / travel))
        return visibleBottom - travel * t
    }

    // region Compaction symétrique

    public data class CellGeometry(
        val id: String,
        val visualMidY: Double,
        val height: Double,
        /** Pilules de jour, frappe, marqueur : elles s'estompent sans changer d'échelle. */
        val isMessage: Boolean,
    )

    public data class CellPose(
        val id: String,
        val scale: Double,
        val alpha: Double,
        /** Translation signée vers la ligne de focus : > 0 vers le bas (rangées au-dessus). */
        val pull: Double,
        /** Pivot vertical de l'échelle : 0 = bas de la rangée, 1 = haut de la rangée. */
        val anchorY: Double,
    )

    public fun poses(cells: List<CellGeometry>, focusY: Double, reduceMotion: Boolean): List<CellPose> {
        val above = cells.filter { it.visualMidY <= focusY }.sortedByDescending { it.visualMidY }
        val below = cells.filter { it.visualMidY > focusY }.sortedBy { it.visualMidY }
        return sideOf(above, reduceMotion, anchorY = 0.0, sign = 1.0) { focusY - it.visualMidY } +
            sideOf(below, reduceMotion, anchorY = 1.0, sign = -1.0) { it.visualMidY - focusY }
    }

    private fun sideOf(
        cells: List<CellGeometry>,
        reduceMotion: Boolean,
        anchorY: Double,
        sign: Double,
        distanceOf: (CellGeometry) -> Double,
    ): List<CellPose> {
        var pull = 0.0
        return cells.map { cell ->
            val law = pose(distanceOf(cell), reduceMotion)
            val scale = if (cell.isMessage) law.scale else 1.0
            val result = CellPose(cell.id, scale, law.alpha, pull = sign * pull + 0.0, anchorY = anchorY)
            pull += (1 - scale) * cell.height
            result
        }
    }

    /** Le message en focus : le plus proche de la ligne, avec l'hystérésis du fil. */
    public fun focusedId(cells: List<CellGeometry>, focusY: Double, currentId: String?): String? {
        val messages = cells.filter { it.isMessage }
        val current = currentId?.let { id -> messages.firstOrNull { it.id == id } }
        if (current != null && abs(focusY - current.visualMidY) <= FocalFocusCurve.THREAD_FOCUS_BAND_HYSTERESIS) {
            return current.id
        }
        return messages.minWithOrNull(
            compareBy<CellGeometry> { abs(focusY - it.visualMidY) }.thenBy { it.id },
        )?.id
    }

    // endregion

    // region Carte du message en focus

    public data class Insets(val top: Double, val left: Double, val bottom: Double, val right: Double)

    public fun focusCardInsets(isFirstInGroup: Boolean): Insets {
        val top = FocalMetrics.Row.PADDING_VERTICAL +
            (if (isFirstInGroup) FocalMetrics.Row.GROUP_TOP_PADDING else 0.0) - FOCUS_CARD_INNER_MARGIN
        val bottom = FocalMetrics.Row.PADDING_VERTICAL - FOCUS_CARD_INNER_MARGIN
        return Insets(
            top = max(0.0, top),
            left = FOCUS_CARD_HORIZONTAL_INSET,
            bottom = max(0.0, bottom),
            right = FOCUS_CARD_HORIZONTAL_INSET,
        )
    }

    /** Loupe du message long DÉPLIÉ, écrêtée à la marge de sa carte et à la gouttière de la rangée. */
    public fun loupeScale(isFocused: Boolean, reduceMotion: Boolean, width: Double, height: Double): Double {
        if (!isFocused || reduceMotion || width <= 0 || height <= 0) return 1.0
        val gain = minOf(
            FocalMetrics.Focus.EXPANDED_LOUPE_GAIN,
            2 * FocalMetrics.FocusCard.MARGIN_VERTICAL / height,
            2 * FocalMetrics.Row.PADDING_HORIZONTAL / width,
        )
        return 1 + gain
    }

    // endregion

    // region Le cadre de l'élu

    /** Cadre de l'élu en X dans le repère de la rangée : il épouse la colonne du message. */
    public data class CardFrame(val minX: Double, val width: Double) {
        val maxX: Double get() = minX + width
    }

    public fun electedCardFrame(rowWidth: Double, isRightToLeft: Boolean): CardFrame {
        val column = rowWidth -
            2 * FocalMetrics.Row.PADDING_HORIZONTAL -
            FocalMetrics.MetaColumn.RESERVED_WIDTH -
            FocalMetrics.MetaColumn.SPACING
        val width = max(0.0, column + 2 * ELECTED_CARD_MARGIN)
        val minX = if (isRightToLeft) rowWidth - FOCUS_CARD_HORIZONTAL_INSET - width else FOCUS_CARD_HORIZONTAL_INSET
        return CardFrame(minX = minX, width = width)
    }

    /** Pivot horizontal de la loupe : le bord d'attaque de la colonne, qui reste à sa place. */
    public fun electedPivotX(rowWidth: Double, isRightToLeft: Boolean): Double =
        if (isRightToLeft) rowWidth - FocalMetrics.Row.PADDING_HORIZONTAL else FocalMetrics.Row.PADDING_HORIZONTAL

    /** Échelle de l'élu : le gain de loupe, borné par la seule largeur de l'écran. Reduce motion : 1. */
    public fun electedScale(reduceMotion: Boolean, rowWidth: Double): Double {
        if (reduceMotion) return 1.0
        val card = electedCardFrame(rowWidth, isRightToLeft = false).width
        if (card <= 0) return 1.0
        val fit = (rowWidth - 2 * FOCUS_CARD_HORIZONTAL_INSET) / card
        return max(1.0, min(1 + FocalMetrics.Focus.LOUPE_GAIN, fit))
    }

    /** Ce dont le contenu de l'élu descend en RENDU : la pastille d'identité d'une suite, plus la respiration. */
    public fun electedContentLift(isFirstInGroup: Boolean): Double =
        FocalMetrics.FocusStrip.contentLift(isFirstInGroup) + ELECTED_CONTENT_BREATHING

    public fun electedStripTop(columnHeight: Double, contentMinY: Double, contentHeight: Double, scale: Double): Double =
        max(columnHeight, contentMinY + scale * contentHeight) +
            FocalMetrics.FocusStrip.STRIP_GAP + ELECTED_CONTENT_BREATHING

    /** Ce que le contenu grossi déborde de sa colonne du côté de fin de lecture. */
    public fun electedExtraWidth(columnWidth: Double, contentWidth: Double, scale: Double): Double =
        max(0.0, scale * contentWidth - columnWidth)

    public data class Span(val top: Double, val bottom: Double)

    public data class ElectedGeometry(val card: Span, val identityChip: Span, val content: Span, val strip: Span)

    /**
     * Disposition de l'élu dans le repère visuel de la cellule, avant le passage : identité et bande à
     * l'échelle 1, contenu seul grossi autour de son bord haut, cadre qui les englobe à
     * [ELECTED_CARD_MARGIN]. La hauteur du contenu est un majorant : le cadre réel n'est jamais plus grand.
     */
    public fun electedGeometry(isFirstInGroup: Boolean, cellHeight: Double, contentScale: Double): ElectedGeometry {
        val pad = FocalMetrics.Row.PADDING_VERTICAL
        val blockTop = pad + if (isFirstInGroup) FocalMetrics.Row.GROUP_TOP_PADDING else 0.0
        val blockBottom = cellHeight - pad
        val lift = electedContentLift(isFirstInGroup)
        val header = if (isFirstInGroup) FocalMetrics.Focus.AVATAR_SIZE + pad else 0.0
        val contentTop = blockTop + lift + header
        val contentHeight = max(0.0, blockBottom + lift - contentTop)
        val contentBottom = contentTop + contentScale * contentHeight
        val stripTop = contentBottom + FocalMetrics.FocusStrip.STRIP_GAP + ELECTED_CONTENT_BREATHING
        val identity = Span(blockTop, blockTop + FocalMetrics.FocusStrip.IDENTITY_CHIP_HEIGHT)
        val strip = Span(stripTop, stripTop + FocalMetrics.FocusStrip.CHIP_HEIGHT)
        return ElectedGeometry(
            card = Span(identity.top - ELECTED_CARD_MARGIN, strip.bottom + ELECTED_CARD_MARGIN),
            identityChip = identity,
            content = Span(contentTop, contentBottom),
            strip = strip,
        )
    }

    /** Zone de toucher débordante de l'élu : la bande basse vit entière hors des bornes de la cellule. */
    public data class TouchOverflow(val top: Double, val bottom: Double)

    public fun electedTouchOverflow(geometry: ElectedGeometry, cellHeight: Double): TouchOverflow =
        TouchOverflow(
            top = max(0.0, -geometry.card.top),
            bottom = max(0.0, geometry.card.bottom - cellHeight),
        )

    // endregion

    // region Le passage ouvert autour de la carte magnifiée

    /** Ce que les voisines d'une rangée magnifiée doivent céder pour que le cadre ne recouvre jamais leur texte. */
    public data class ElectionClearance(val above: Double, val below: Double)

    public fun electionClearance(isFirstInGroup: Boolean, cellHeight: Double, scale: Double): ElectionClearance {
        val pad = FocalMetrics.Row.PADDING_VERTICAL
        val card = electedGeometry(isFirstInGroup, cellHeight, scale).card
        return ElectionClearance(
            above = max(0.0, -pad - card.top + pad),
            below = max(0.0, card.bottom + pad - (cellHeight + pad)),
        )
    }

    /** Translation visuelle (> 0 vers le bas) d'une cellule autour de la rangée magnifiée. */
    public fun electionShift(cellMidY: Double, magnifiedMidY: Double?, clearance: ElectionClearance): Double {
        if (magnifiedMidY == null || cellMidY == magnifiedMidY) return 0.0
        return if (cellMidY < magnifiedMidY) -clearance.above else clearance.below
    }

    // endregion
}
