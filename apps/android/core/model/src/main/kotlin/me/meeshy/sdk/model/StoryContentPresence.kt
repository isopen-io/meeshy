package me.meeshy.sdk.model

/**
 * Cette story a-t-elle quoi que ce soit à restituer ? Miroir de iOS `StoryContentPresence`.
 *
 * Des stories entièrement vides existent en base (`media: []`, `textObjects: []`, `content: null`) ; le lecteur
 * les rendait en écran noir pendant toute la durée de slide. Le prédicat est CONSERVATEUR : au moindre champ
 * porteur, la story est affichable (un faux positif ferait disparaître du contenu réel, infiniment plus grave
 * qu'un écran noir). Une story purement sonore reste un message à part entière.
 */
object StoryContentPresence {

    fun hasRenderableContent(story: StoryItem): Boolean {
        if (story.content.isMeaningful()) return true
        if (story.media.isNotEmpty()) return true
        if (story.audioUrl.isMeaningful()) return true
        if (story.backgroundAudio != null) return true
        // Un repost restitue la story d'origine : le contenu vit ailleurs.
        if (story.repostOfId.isMeaningful()) return true
        val effects = story.storyEffects ?: return false
        return effects.background.isMeaningful() ||
            effects.textObjects.any { it.text.isMeaningful() } ||
            effects.mediaObjects.isNotEmptyOrFalse() ||
            effects.audioPlayerObjects.isNotEmptyOrFalse() ||
            effects.stickerObjects.isNotEmptyOrFalse() ||
            effects.stickers.isNotEmptyOrFalse() ||
            effects.drawingStrokes.isNotEmptyOrFalse() ||
            effects.locationObjects.isNotEmpty() ||
            effects.backgroundAudioId.isMeaningful() ||
            effects.backgroundAudioVariants.isNotEmptyOrFalse() ||
            effects.unpaintableKinds.isNotEmpty() ||
            effects.canvas != null ||
            effects.document != null
    }

    private fun List<*>?.isNotEmptyOrFalse(): Boolean = this?.isNotEmpty() == true

    private fun String?.isMeaningful(): Boolean = this != null && this.isNotBlank()
}
