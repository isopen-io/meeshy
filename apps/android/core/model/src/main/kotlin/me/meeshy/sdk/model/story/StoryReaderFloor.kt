package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.StoryItem

/** Ce que peint le fond de la scène du lecteur SOUS la carte — miroir de `StoryReaderBackground` et du sol. */
sealed interface StoryReaderBackdrop {
    /** Un vrai média : noir immersif sous le sol flou, jamais la couleur de l'auteur (elle teinterait le média). */
    data object Black : StoryReaderBackdrop

    /** Sans média : la couleur ou le dégradé de l'auteur ([value] sérialisé, `null` = dégradé de marque). */
    data class Author(val value: String?) : StoryReaderBackdrop
}

/**
 * La recette du SOL (le flou dérivé de l'empreinte autour de la carte), partagée avec la galerie et le réel :
 * flou 60, échelle 1,18, opacité 0,85, voile 0,18 en carte et 0 en plein bord. Avant l'API 31 (pas de
 * RenderEffect) le flou se remplace par un scrim opaque ([FALLBACK_SCRIM_ALPHA]).
 */
object StoryReaderFloor {
    const val BLUR_RADIUS_DP: Float = 60f
    const val SCALE: Float = 1.18f
    const val OPACITY: Float = 0.85f
    const val CARDED_VEIL: Float = 0.18f
    const val FULL_VEIL: Float = 0f
    const val FALLBACK_SCRIM_ALPHA: Float = 0.55f
    const val BLUR_MIN_SDK: Int = 31

    fun veil(expanded: Boolean): Float = if (expanded) FULL_VEIL else CARDED_VEIL

    fun supportsBlur(sdkInt: Int): Boolean = sdkInt >= BLUR_MIN_SDK

    fun backdrop(hasMediaBackground: Boolean, background: String?): StoryReaderBackdrop =
        if (hasMediaBackground) StoryReaderBackdrop.Black else StoryReaderBackdrop.Author(background?.takeIf { it.isNotBlank() })

    /** L'empreinte UNIQUE de la carte ET du sol : la slide, sinon la première empreinte non vide des médias. */
    fun backdropHash(item: StoryItem): String? =
        item.storyEffects?.thumbHash?.takeIf { it.isNotEmpty() } ?: backdropHash(item.media)

    private fun backdropHash(media: List<FeedMedia>): String? = media.firstNotNullOfOrNull { it.thumbHash?.takeIf { h -> h.isNotEmpty() } }
}
