package me.meeshy.sdk.model

/**
 * Où la lecture commence dans un groupe. Miroir de iOS `StoryIndexResolver`.
 *
 * `group.stories` est croissant par `createdAt` (ordre de lecture) : on cherche ici, jamais dans une liste triée
 * pour l'affichage (Mes stories, plus récente d'abord).
 */
object StoryIndexResolver {

    /** L'index de [postId] dans [group], ou [fallback] quand il est `null` ou absent. */
    fun index(postId: String?, group: StoryGroup, fallback: Int): Int {
        if (postId == null) return fallback
        val found = group.stories.indexOfFirst { it.id == postId }
        return if (found >= 0) found else fallback
    }

    /**
     * Le départ d'un groupe quand rien n'est nommé : la première story NON VUE et lisible, sinon la première
     * lisible, sinon `null` (le groupe n'a rien à montrer). Même règle que [StoryPlaybackSkipResolver].
     */
    fun entryIndex(group: StoryGroup, isUnplayable: (StoryItem) -> Boolean): Int? =
        group.stories.indexOfFirst { !it.isViewed && !isUnplayable(it) }.takeIf { it >= 0 }
            ?: group.stories.indexOfFirst { !isUnplayable(it) }.takeIf { it >= 0 }
}
