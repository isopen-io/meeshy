package me.meeshy.app.navigation

/**
 * L'ancienne route `story_composer` redirige vers l'hôte unique avec l'intention équivalente (porte du plateau de stories).
 * Seule une entrée SANS argument a un équivalent livré par l'hôte : republier, modifier, « Composer » depuis une story vue et
 * l'audience de l'onboarding gardent l'ancien écran, tant que l'hôte n'en porte pas la surface — aucune porte morte.
 */
internal object LegacyStoryComposerRedirect {
    /** La route de l'hôte à ouvrir à la place, ou `null` : l'ancien écran sert l'entrée. */
    fun target(repostOfId: String?, audience: String?, editStoryId: String?, recomposeStoryId: String?): String? =
        if (listOf(repostOfId, audience, editStoryId, recomposeStoryId).all { it.isNullOrBlank() }) storyDoor else null
}
