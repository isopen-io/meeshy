package me.meeshy.sdk.model.reading.focal

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Loi de dépliage d'un long message dans le fil — miroir de `LongMessageExpansionLaw` (iOS, #16463). Le déplié est un
 * message ORDINAIRE du mode courant : aucune mise en avant, aucun « Réduire ». Il reste déplié tant que la conversation
 * est ouverte (l'état vit chez l'hôte du fil, recréé à chaque ouverture), et plusieurs messages peuvent l'être.
 */
object LongMessageExpansionLaw {

    enum class Anchor { Top, Bottom }
    enum class Pin { Origin, End }

    /** Fenêtre pendant laquelle le bord ancré est tenu : durée de hauteur + 0.35 s (0.65 s). */
    const val HOLD_WINDOW_SECONDS: Double = 0.3 + 0.35

    /** Le bord qui ne bouge pas : le HAUT — l'extrait reste en place, la suite se déroule dessous. */
    val ANCHOR: Anchor = Anchor.Top

    /** Les dépliés après un toucher sur [tapped] : il s'y ajoute, et rien ne se replie. */
    fun expanded(current: Set<String>, tapped: String): Set<String> = current + tapped

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
}
