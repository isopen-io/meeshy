package me.meeshy.sdk.model

/** Les commentaires que la galerie d'un post feuillette : fusion du cache, du réseau et du temps réel — miroir de `PostGalleryCommentFeed` iOS. */
object PostGalleryCommentFeed {

    fun adding(comment: ApiPostComment, to: List<ApiPostComment>): List<ApiPostComment> =
        if (to.none { it.id == comment.id }) to + comment else to.map { if (it.id == comment.id) comment else it }

    fun removing(commentId: String, from: List<ApiPostComment>): List<ApiPostComment> =
        from.filter { it.id != commentId && it.parentId != commentId }

    /** Les lignes reçues remplacent celles déjà affichées (même identité), les inconnues se placent à la suite. */
    fun merging(incoming: List<ApiPostComment>, into: List<ApiPostComment>): List<ApiPostComment> {
        val received = incoming.associateBy { it.id }
        val shown = into.mapTo(HashSet()) { it.id }
        val fresh = incoming.filter { shown.add(it.id) }
        return into.map { received[it.id] ?: it } + fresh
    }
}
