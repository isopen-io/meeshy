package me.meeshy.sdk.model

/**
 * Portée du lecteur de stories : quels auteurs il navigue, et sur lequel il s'ouvre. Miroir de iOS
 * `StoryViewerScope`. Un seul site de décision pour le mode groupe unique et pour « Mes stories ».
 */
object StoryViewerScope {

    data class Resolved(val groups: List<StoryGroup>, val currentIndex: Int)

    /**
     * [singleGroup] : le lecteur reste sur un unique auteur (ouverture depuis une conversation, une notification ou
     * un lien) au lieu de passer à l'auteur suivant. Index hors bornes ⇒ navigation complète plutôt qu'un lecteur vide.
     */
    fun resolve(all: List<StoryGroup>, resolvedIndex: Int, singleGroup: Boolean): Resolved {
        if (!singleGroup || resolvedIndex !in all.indices) {
            return Resolved(all, if (resolvedIndex in all.indices) resolvedIndex else 0)
        }
        return Resolved(listOf(all[resolvedIndex]), 0)
    }

    /**
     * Mes stories : seules les stories EN COURS de l'auteur, plus celle qu'on a ouverte explicitement ([keeping]).
     * Sans story en cours, le groupe reste entier : le lecteur ne s'ouvre jamais vide.
     */
    fun liveOnly(
        groups: List<StoryGroup>,
        authorId: String?,
        keeping: String?,
        isExpired: (StoryItem) -> Boolean,
    ): List<StoryGroup> = groups.map { group ->
        if (authorId == null || group.id != authorId) return@map group
        val live = group.stories.filter { !isExpired(it) || it.id == keeping }
        if (live.isEmpty()) group else group.copy(stories = live)
    }

    /** La même story retrouvée dans le groupe filtré ; une archive écartée retombe sur la première en cours. */
    fun storyIndex(index: Int, original: StoryGroup, scoped: StoryGroup): Int {
        val id = original.stories.getOrNull(index)?.id ?: return 0
        return scoped.stories.indexOfFirst { it.id == id }.coerceAtLeast(0)
    }
}
