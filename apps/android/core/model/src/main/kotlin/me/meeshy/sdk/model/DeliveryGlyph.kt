package me.meeshy.sdk.model

/** Les huit états de livraison du pied d'une bulle (iOS `MeeshyMessage.DeliveryStatus`). */
enum class DeliveryGlyphState { Invisible, Sending, Clock, Slow, Sent, Delivered, Read, Failed }

/** La forme de la coche. */
enum class DeliveryGlyphShape { None, Clock, Hourglass, Check, DoubleCheck, ErrorCircle }

/** La teinte : méta du contexte, méta atténuée, alerte, accusé de lecture indigo, erreur. */
enum class DeliveryGlyphTone { Meta, MetaFaded, Warning, Read, Error }

/** La nuance de l'accusé de lecture : jamais blanc, jamais gras. */
enum class ReadShade { Indigo400, Indigo600 }

/** Ce que le lecteur d'écran dit de chaque état. */
enum class DeliveryGlyphLabel { OfflinePending, Sending, Slow, Sent, Delivered, Read, Failed }

data class DeliveryGlyph(
    val shape: DeliveryGlyphShape,
    val tone: DeliveryGlyphTone,
    val label: DeliveryGlyphLabel?,
)

object DeliveryGlyphs {
    /** Opacité de l'horloge « en cours » (iOS `MeeshyOpacity.heavy`). */
    const val CLOCK_OPACITY: Float = 0.8f

    private val hidden = DeliveryGlyph(DeliveryGlyphShape.None, DeliveryGlyphTone.Meta, null)

    /**
     * La coche d'un état. Hors ligne, un envoi encore en vol montre un sablier orange. [sendingRevealed]
     * : l'horloge d'un envoi frais n'apparaît qu'après 200 ms ([SendLifecycleResolver]).
     */
    fun resolve(state: DeliveryGlyphState, isOffline: Boolean, sendingRevealed: Boolean = true): DeliveryGlyph {
        val inFlight = state == DeliveryGlyphState.Sending || state == DeliveryGlyphState.Clock || state == DeliveryGlyphState.Slow
        if (isOffline && inFlight) {
            return DeliveryGlyph(DeliveryGlyphShape.Hourglass, DeliveryGlyphTone.Warning, DeliveryGlyphLabel.OfflinePending)
        }
        return when (state) {
            DeliveryGlyphState.Invisible -> hidden
            DeliveryGlyphState.Sending ->
                if (sendingRevealed) DeliveryGlyph(DeliveryGlyphShape.Clock, DeliveryGlyphTone.Meta, DeliveryGlyphLabel.Sending) else hidden
            DeliveryGlyphState.Clock -> DeliveryGlyph(DeliveryGlyphShape.Clock, DeliveryGlyphTone.MetaFaded, DeliveryGlyphLabel.Sending)
            DeliveryGlyphState.Slow -> DeliveryGlyph(DeliveryGlyphShape.Clock, DeliveryGlyphTone.Warning, DeliveryGlyphLabel.Slow)
            DeliveryGlyphState.Sent -> DeliveryGlyph(DeliveryGlyphShape.Check, DeliveryGlyphTone.Meta, DeliveryGlyphLabel.Sent)
            DeliveryGlyphState.Delivered -> DeliveryGlyph(DeliveryGlyphShape.DoubleCheck, DeliveryGlyphTone.Meta, DeliveryGlyphLabel.Delivered)
            DeliveryGlyphState.Read -> DeliveryGlyph(DeliveryGlyphShape.DoubleCheck, DeliveryGlyphTone.Read, DeliveryGlyphLabel.Read)
            DeliveryGlyphState.Failed -> DeliveryGlyph(DeliveryGlyphShape.ErrorCircle, DeliveryGlyphTone.Error, DeliveryGlyphLabel.Failed)
        }
    }

    /** Indigo 400 en sombre et sur la capsule overlay, indigo 600 en clair. */
    fun readShade(isDark: Boolean, onOverlay: Boolean): ReadShade =
        if (isDark || onOverlay) ReadShade.Indigo400 else ReadShade.Indigo600

    /** Le bouton « Renvoyer » du pied : un échec, sauf si la bande orange de renvoi est déjà affichée. */
    fun footerShowsRetry(isFailed: Boolean, retryBandShown: Boolean): Boolean = isFailed && !retryBandShown
}
