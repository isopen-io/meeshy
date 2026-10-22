package me.meeshy.sdk.model.reading.focal

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Loi de dépliage d'un long message dans le fil — miroir de `LongMessageExpansionLaw` (iOS). */
object LongMessageExpansionLaw {

    enum class Anchor { Top, Bottom }
    enum class Pin { Origin, End }

    /** Fenêtre pendant laquelle l'état de dépliage est maintenu : durée de hauteur + 0.35 s (0.65 s). */
    const val HOLD_WINDOW_SECONDS: Double = 0.3 + 0.35

    /** Alpha des autres rangées tant qu'un message déplié est visible. */
    const val NEIGHBOR_ALPHA: Float = FocalMetrics.Glass.NEIGHBOR_OPACITY

    /** Un seul message déplié à la fois : retoucher le déplié le replie, un autre le remplace. */
    fun nextExpanded(current: String?, toggled: String): String? =
        if (current == toggled) null else toggled

    /** Ancre haut à l'ouverture, bas au repli. */
    fun anchor(isExpanding: Boolean): Anchor = if (isExpanding) Anchor.Top else Anchor.Bottom

    fun anchoredOffset(
        current: Float,
        edgeBefore: Float,
        edgeAfter: Float,
        minOffset: Float,
        maxOffset: Float,
    ): Float {
        val target = current + (edgeBefore - edgeAfter)
        return min(max(target, minOffset), max(minOffset, maxOffset))
    }

    data class Rect(val left: Float, val top: Float, val right: Float, val bottom: Float) {
        val isEmpty: Boolean get() = right <= left || bottom <= top
        fun inset(dx: Float, dy: Float): Rect = Rect(left + dx, top + dy, right - dx, bottom - dy)
    }

    private const val FOCUS_CARD_HORIZONTAL_INSET = 6f

    fun glassFrame(bubble: Rect?, row: Rect): Rect {
        if (bubble == null || bubble.isEmpty) return row.inset(FOCUS_CARD_HORIZONTAL_INSET, 0f)
        return bubble.inset(-FOCUS_CARD_HORIZONTAL_INSET, -FocalMetrics.Row.PADDING_VERTICAL)
    }

    data class HeightTiming(val durationSeconds: Double, val controlPoints: List<Double>)

    /** `null` en Réduire les animations : la hauteur atterrit d'un coup. */
    fun heightTiming(reduceMotion: Boolean): HeightTiming? =
        if (reduceMotion) null
        else HeightTiming(FocalMetrics.Focus.EXPAND_DURATION_SECONDS, FocalMetrics.Focus.EXPAND_CURVE)

    data class Span(val origin: Float, val length: Float) {
        val end: Float get() = origin + length
    }

    fun pin(anchor: Anchor, listIsInverted: Boolean): Pin =
        if ((anchor == Anchor.Top) == listIsInverted) Pin.End else Pin.Origin

    data class HeightMotion(val translationFrom: Float, val revealFrom: Span?)

    fun heightMotion(before: Span, after: Span, pin: Pin): HeightMotion? {
        val translation = if (pin == Pin.Origin) before.origin - after.origin else before.end - after.end
        val grows = after.length > before.length + 0.5f
        if (abs(translation) <= 0.5f && !grows) return null
        val reveal = if (grows) {
            Span(if (pin == Pin.Origin) 0f else after.length - before.length, before.length)
        } else {
            null
        }
        return HeightMotion(translation, reveal)
    }

    fun regionShift(beyondEnd: Boolean, expandedBefore: Span, expandedAfter: Span): Float =
        if (beyondEnd) expandedAfter.end - expandedBefore.end else expandedAfter.origin - expandedBefore.origin

    fun alpha(isExpandedCell: Boolean, expansionVisible: Boolean): Float =
        if (!expansionVisible || isExpandedCell) 1f else NEIGHBOR_ALPHA
}
