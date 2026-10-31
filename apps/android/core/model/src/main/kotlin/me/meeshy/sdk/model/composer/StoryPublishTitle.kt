package me.meeshy.sdk.model.composer

/**
 * Ce que le bouton de publication NOMME : la story seule, N stories (une par slide — c'est le
 * canal de la scène), la story et son réel, le post ou le réel. Miroir de `ComposerPublishMenuCopy.publishTitle`.
 */
sealed interface StoryPublishTitle {
    data object Single : StoryPublishTitle
    data class Many(val count: Int) : StoryPublishTitle
    data object StoryAndReel : StoryPublishTitle

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
    }
}
