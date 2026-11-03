package me.meeshy.sdk.model

/**
 * La position du lecteur se tient par IDENTITÉ, pas par rang. Miroir de iOS `StoryViewerPosition`.
 *
 * La liste bouge sous le lecteur ouvert (tri après `story:created`/`viewed`/`updated`, purge des stories supprimées
 * ou expirées). Une insertion ou un tri ne doit pas changer la story regardée ; une story retirée avant la courante
 * ne doit pas sauter la suivante ; plusieurs groupes retirés d'un coup ne doivent jamais laisser l'index hors bornes.
 */
object StoryViewerPosition {

    /** Ce qui suffit pour retrouver une position : l'auteur et ses stories. */
    data class GroupShape(val id: String, val storyIds: List<String>)

    data class Landing(val group: Int, val story: Int)

    fun shapes(groups: List<StoryGroup>): List<GroupShape> =
        groups.map { GroupShape(it.id, it.stories.map(StoryItem::id)) }

    /**
     * La position, dans [new], de la story montrée à [position] dans [old] :
     * la story existe encore ⇒ sa position où qu'elle soit passée ; elle a disparu, son auteur reste ⇒ la story qui
     * la suivait (même rang, bornée à la dernière) ; l'auteur a disparu ⇒ l'auteur qui occupe son rang (borné), à sa
     * première story ; plus rien ⇒ `null`.
     */
    fun reanchor(old: List<GroupShape>, new: List<GroupShape>, position: Landing): Landing? {
        val lastGroup = new.lastIndex.takeIf { it >= 0 } ?: return null
        val anchoredGroup = old.getOrNull(position.group) ?: return clamped(position, new)
        val anchoredStory = anchoredGroup.storyIds.getOrNull(position.story)

        val groupIndex = new.indexOfFirst { it.id == anchoredGroup.id }
        if (groupIndex >= 0 && new[groupIndex].storyIds.isNotEmpty()) {
            val stories = new[groupIndex].storyIds
            val storyIndex = anchoredStory?.let(stories::indexOf) ?: -1
            if (storyIndex >= 0) return Landing(groupIndex, storyIndex)
            return Landing(groupIndex, position.story.coerceIn(0, stories.lastIndex))
        }
        return Landing(position.group.coerceIn(0, lastGroup), 0)
    }

    /** « Auteur précédent » : le groupe d'avant, posé sur sa dernière story ; l'index borné d'abord. */
    fun previousGroupLanding(storyCounts: List<Int>, fromGroupIndex: Int): Landing? {
        val target = minOf(fromGroupIndex - 1, storyCounts.lastIndex)
        if (target < 0) return null
        return Landing(target, (storyCounts[target] - 1).coerceAtLeast(0))
    }

    fun nextGroupIndex(afterGroupIndex: Int, groupCount: Int): Int? =
        (afterGroupIndex + 1).takeIf { it in 0 until groupCount }

    fun storyId(position: Landing, groups: List<GroupShape>): String? =
        groups.getOrNull(position.group)?.storyIds?.getOrNull(position.story)

    private fun clamped(position: Landing, groups: List<GroupShape>): Landing? {
        val last = groups.lastIndex.takeIf { it >= 0 } ?: return null
        val group = position.group.coerceIn(0, last)
        return Landing(group, position.story.coerceIn(0, (groups[group].storyIds.size - 1).coerceAtLeast(0)))
    }
}
