package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MosaicLayoutMode

/**
 * Ce qui VARIE d'un format à l'autre quand la story, le post et le réel se composent sur la MÊME scène (#13863 R2) — la
 * table unique ; tout le reste de la scène est commun. L'humeur ne se compose pas sur la scène : elle garde sa feuille.
 */
data class ComposerFormatVariant(
    val format: ComposerFormat,
    val composesOnScene: Boolean,
    /** « Texte du post » : la légende du post ou du réel, hors de la scène, posée depuis le socle. */
    val writesPostText: Boolean,
    /** Une story légende chacune de ses diapos ; le post et le réel portent un seul texte, le leur. */
    val captionsSlides: Boolean,
    /** Les plafonds propres à la story (durée d'une diapo, légende par diapo). */
    val keepsStoryLimits: Boolean,
) {
    val channel: ComposerPublishChannel get() = ComposerPublishChannel.of(format)

    fun publishTitle(slideCount: Int, editing: Boolean = false): StoryPublishTitle = when {
        editing -> StoryPublishTitle.Save
        format == ComposerFormat.POST -> StoryPublishTitle.Post
        format == ComposerFormat.REEL -> StoryPublishTitle.Reel
        else -> StoryPublishTitle.of(slideCount, alsoAsReel = false)
    }

    /** « Disposition des scènes » : sous le post seulement, dès deux scènes ([ComposerMosaicChoice.offered]). */
    fun layouts(sceneCount: Int): List<MosaicLayoutMode> = ComposerMosaicChoice.offered(sceneCount, format)

    companion object {
        fun of(format: ComposerFormat): ComposerFormatVariant = when (format) {
            ComposerFormat.STORY -> ComposerFormatVariant(format, true, writesPostText = false, captionsSlides = true, keepsStoryLimits = true)
            ComposerFormat.POST, ComposerFormat.REEL ->
                ComposerFormatVariant(format, true, writesPostText = true, captionsSlides = false, keepsStoryLimits = false)
            ComposerFormat.STATUS -> ComposerFormatVariant(format, false, writesPostText = false, captionsSlides = false, keepsStoryLimits = false)
        }
    }
}
