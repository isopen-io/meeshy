package me.meeshy.sdk.model.composer

/**
 * Ce que le bouton de publication NOMME : la story seule, N stories (une par slide — c'est le
 * canal de la scène), le post, le réel, ou chaque format coché ensemble (#13919). Miroir de `ComposerPublishMenuCopy.publishTitle`.
 */
sealed interface StoryPublishTitle {
    data object Single : StoryPublishTitle
    data class Many(val count: Int) : StoryPublishTitle
    data object StoryAndReel : StoryPublishTitle

    /** Plusieurs formats cochés d'un seul geste (#13919) : la capsule les nomme tous. */
    data object StoryAndPost : StoryPublishTitle
    data object PostAndReel : StoryPublishTitle
    data object StoryPostAndReel : StoryPublishTitle

    /** La scène part en post, ou en réel (#13863) : « Publier le post », « Publier le réel ». */
    data object Post : StoryPublishTitle
    data object Reel : StoryPublishTitle

    /** Une story publiée rouverte : le bouton ENREGISTRE la modification, il ne publie rien (#13697). */
    data object Save : StoryPublishTitle

    companion object {
        fun of(slideCount: Int, alsoAsReel: Boolean): StoryPublishTitle = when {
            alsoAsReel -> StoryAndReel
            slideCount > 1 -> Many(slideCount)
            else -> Single
        }

        /** Ce que la capsule nomme quand l'auteur coche un ou plusieurs formats (#13919) : chacun, dans une seule phrase. */
        fun of(formats: List<ComposerFormat>, slideCount: Int, editing: Boolean = false): StoryPublishTitle {
            if (editing) return Save
            return when (formats.toSet()) {
                setOf(ComposerFormat.STORY, ComposerFormat.POST, ComposerFormat.REEL) -> StoryPostAndReel
                setOf(ComposerFormat.STORY, ComposerFormat.POST) -> StoryAndPost
                setOf(ComposerFormat.STORY, ComposerFormat.REEL) -> StoryAndReel
                setOf(ComposerFormat.POST, ComposerFormat.REEL) -> PostAndReel
                else -> ComposerFormatVariant.of(formats.firstOrNull() ?: ComposerFormat.STORY).publishTitle(slideCount)
            }
        }
    }
}
