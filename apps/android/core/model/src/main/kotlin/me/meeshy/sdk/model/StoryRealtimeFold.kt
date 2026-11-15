package me.meeshy.sdk.model

/**
 * Applications des événements sociaux sur une story du plateau (iOS `StoryTrayRules`) : chaque fonction rend la story
 * modifiée, ou `null` quand l'événement n'a rien changé (rediffusion) — l'appelant n'écrit alors rien.
 */
public object StoryRealtimeFold {

    /**
     * `story:viewed` : le total de vues porté par l'événement est autoritatif et toujours appliqué (le compteur de
     * l'auteur bouge pendant que des lecteurs arrivent). L'événement dit qu'UN lecteur a vu la story, pas qu'on
     * l'a vue : `isViewedByMe` ne bouge pas.
     */
    public fun viewed(post: ApiPost, viewCount: Int?): ApiPost? {
        val next = viewCount ?: ((post.viewCount ?: 0) + 1)
        return post.takeIf { it.viewCount != next }?.copy(viewCount = next)
    }

    /**
     * `story:reacted` / `story:unreacted` : ±1 sur l'emoji dans `reactionSummary` (plancher 0, une entrée à zéro
     * disparaît) et, quand l'acteur est le lecteur, bascule de sa propre réaction dans `currentUserReactions`.
     */
    public fun reactionDelta(post: ApiPost, emoji: String, actorId: String, myId: String?, delta: Int): ApiPost? {
        if (delta == 0 || emoji.isBlank()) return null
        val summary = post.reactionSummary.orEmpty().toMutableMap()
        val count = (summary[emoji] ?: 0) + delta
        if (count > 0) summary[emoji] = count else summary.remove(emoji)
        val own = myId != null && actorId == myId
        val mine = post.currentUserReactions
        val nextMine = when {
            !own -> mine
            delta > 0 -> (mine.orEmpty() + emoji).distinct()
            else -> mine.orEmpty().filterNot { it == emoji }
        }
        val next = post.copy(reactionSummary = summary, currentUserReactions = nextMine)
        return next.takeIf { it != post }
    }
}
