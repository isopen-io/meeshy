package me.meeshy.sdk.model

/**
 * Comment un post AFFICHE ses médias — miroir de `PostMediaPresentation` (iOS).
 * Aucun choix d'interface : la présentation se DÉRIVE du type de publication.
 */
public enum class PostMediaPresentation {
    /** Défaut POST — les médias défilent en carrousel. */
    CAROUSEL,

    /** Défaut RÉEL — les médias défilent en diapositives horizontales. */
    HORIZONTAL_SLIDES;

    public companion object {
        public fun defaultFor(postType: PostType): PostMediaPresentation = when (postType) {
            PostType.REEL -> HORIZONTAL_SLIDES
            PostType.POST, PostType.STORY, PostType.STATUS -> CAROUSEL
        }
    }
}
