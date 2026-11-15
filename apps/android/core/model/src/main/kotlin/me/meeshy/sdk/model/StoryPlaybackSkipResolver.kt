package me.meeshy.sdk.model

/**
 * Où doit atterrir la lecture quand la position courante pointe sur une story illisible (expirée ou vide).
 * Miroir de iOS `StoryPlaybackSkipResolver`. Pure : l'expiration est injectée.
 *
 * On saute vers le prochain groupe qui a réellement quelque chose à montrer et on ne ferme qu'à épuisement,
 * jamais au premier obstacle ; l'auteur revisite ses PROPRES stories expirées pour lire réactions et commentaires.
 */
object StoryPlaybackSkipResolver {

    sealed interface Outcome {
        /** Rien à faire : la position courante est lisible. */
        data object Stay : Outcome

        /** Avancer dans le groupe courant. */
        data class AdvanceStory(val index: Int) : Outcome

        /** Le groupe courant n'a plus rien : passer à un groupe qui a du contenu. */
        data class AdvanceGroup(val groupIndex: Int, val storyIndex: Int) : Outcome

        /** Plus rien nulle part. */
        data object Close : Outcome
    }

    fun resolve(
        groups: List<StoryGroup>,
        groupIndex: Int,
        storyIndex: Int,
        currentUserId: String?,
        isExpired: (StoryItem) -> Boolean,
    ): Outcome {
        val group = groups.getOrNull(groupIndex) ?: return Outcome.Stay
        if (group.stories.isEmpty()) return Outcome.Stay
        if (currentUserId != null && group.id == currentUserId) return Outcome.Stay

        val unplayable = { story: StoryItem -> isUnplayable(story, isExpired) }
        var index = storyIndex.coerceAtLeast(0)
        while (index < group.stories.size && unplayable(group.stories[index])) index++
        if (index < group.stories.size) {
            return if (index == storyIndex) Outcome.Stay else Outcome.AdvanceStory(index)
        }
        for (next in groupIndex + 1 until groups.size) {
            val entry = StoryIndexResolver.entryIndex(groups[next], unplayable) ?: continue
            return Outcome.AdvanceGroup(next, entry)
        }
        return Outcome.Close
    }

    /** Un seul prédicat pour la boucle de saut et l'index d'entrée : ils ne peuvent pas diverger. */
    fun isUnplayable(story: StoryItem, isExpired: (StoryItem) -> Boolean): Boolean =
        isExpired(story) || !StoryContentPresence.hasRenderableContent(story)
}
