package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiPost

/**
 * « Republier » au geste (#14456, iOS `FeedPostEngagementState.repostedIds` / `repostDelta` / `repostInFlightIds`) : le
 * compte qu'une republication de ce lecteur garantit à chaque carte, et celles qui attendent encore leur réponse.
 *
 * Le compte retenu est un PLANCHER, jamais un delta : quand le serveur rattrape (le fil rechargé compte déjà la
 * republication), la carte ne la compte pas une seconde fois ; quand d'autres republient entre-temps, le compte servi
 * l'emporte. Une republication ne se défait pas : seul un refus du serveur rend la carte à son état d'avant le geste.
 */
data class RepostMarks(
    val floors: Map<String, Int> = emptyMap(),
    val inFlight: Set<String> = emptySet(),
) {
    /** Le geste sur [postId] servi avec [served] republications, ou `null` tant que le précédent attend sa réponse. */
    fun begun(postId: String, served: Int): RepostMarks? =
        if (postId in inFlight) null
        else copy(floors = floors + (postId to count(postId, served) + 1), inFlight = inFlight + postId)

    fun confirmed(postId: String): RepostMarks = copy(inFlight = inFlight - postId)

    /** Le serveur a refusé : la carte reprend le plancher qu'elle avait dans [before], l'état d'avant le geste. */
    fun refused(postId: String, before: RepostMarks): RepostMarks {
        val floor = before.floors[postId]
        return copy(
            floors = if (floor == null) floors - postId else floors + (postId to floor),
            inFlight = inFlight - postId,
        )
    }

    fun count(postId: String, served: Int): Int = maxOf(served, floors[postId] ?: 0)

    fun has(postId: String): Boolean = postId in floors

    fun applyTo(post: ApiPost): ApiPost {
        if (!has(post.id)) return post
        return post.copy(repostCount = count(post.id, post.repostCount ?: 0), isRepostedByMe = true)
    }
}

internal fun List<ApiPost>.withRepostMarks(marks: RepostMarks): List<ApiPost> =
    if (marks.floors.isEmpty()) this else map(marks::applyTo)
