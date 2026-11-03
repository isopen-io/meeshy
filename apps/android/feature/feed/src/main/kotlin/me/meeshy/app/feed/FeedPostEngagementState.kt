package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiPost

/**
 * L'état d'ENGAGEMENT du fil (aimé, enregistré, republié, partagé), en un seul objet immuable — iOS
 * `FeedPostEngagementState`. Le post servi ne dit pas toujours ce que le lecteur vient de faire : l'état suit donc
 * LOCALEMENT les ids que le lecteur a posés et les deltas de compteurs, et se réconcilie avec ce que la liste
 * rechargée et les sockets annoncent. Aucune méthode ne mute le post ni l'état : chacune rend un nouvel état (ou la
 * même instance quand rien ne change).
 *
 * Le compteur affiché ne descend jamais sous zéro : un retrait tardif sur un compteur que le serveur a déjà
 * décrémenté ne fabrique pas de valeur négative.
 */
data class FeedPostEngagementState(
    val likedIds: Set<String> = emptySet(),
    val likeDelta: Map<String, Int> = emptyMap(),
    val heartInFlightIds: Set<String> = emptySet(),
    val bookmarkedIds: Set<String> = emptySet(),
    val bookmarkDelta: Map<String, Int> = emptyMap(),
    val bookmarkInFlightIds: Set<String> = emptySet(),
    val repostedIds: Set<String> = emptySet(),
    val repostDelta: Map<String, Int> = emptyMap(),
    val repostInFlightIds: Set<String> = emptySet(),
    val shareDelta: Map<String, Int> = emptyMap(),
    val shareInFlightIds: Set<String> = emptySet(),
) {

    /** Ce qu'UNE carte lit de l'engagement : des valeurs, jamais l'état. */
    fun snapshot(post: ApiPost): FeedPostEngagementSnapshot = FeedPostEngagementSnapshot(
        isLiked = post.id in likedIds,
        displayLikeCount = shown(post.likeCount, likeDelta[post.id]),
        isHeartInFlight = post.id in heartInFlightIds,
        isBookmarked = post.id in bookmarkedIds,
        isBookmarkInFlight = post.id in bookmarkInFlightIds,
        displayBookmarkCount = shown(post.bookmarkCount, bookmarkDelta[post.id]),
        isReposted = post.id in repostedIds,
        isRepostInFlight = post.id in repostInFlightIds,
        displayRepostCount = shown(post.repostCount, repostDelta[post.id]),
        isShareInFlight = post.id in shareInFlightIds,
        displayShareCount = shown(post.shareCount, shareDelta[post.id]),
    )

    /**
     * Premier relevé du fil chargé (ou du cache disque) : n'amorce que les posts que l'état ne suit pas encore, pour ne
     * jamais écraser un geste optimiste en vol.
     */
    fun seededFrom(posts: List<ApiPost>): FeedPostEngagementState {
        val liked = posts.filter { it.isLikedByMe == true && it.id !in likedIds && it.id !in likeDelta }.map { it.id }
        val bookmarked = posts.filter { it.isBookmarkedByMe == true && it.id !in bookmarkInFlightIds }.map { it.id }
        val reposted = posts.filter { it.isRepostedByMe == true && it.id !in repostInFlightIds }.map { it.id }
        if (liked.isEmpty() && bookmarked.isEmpty() && reposted.isEmpty()) return this
        return copy(likedIds = likedIds + liked, bookmarkedIds = bookmarkedIds + bookmarked, repostedIds = repostedIds + reposted)
    }

    /**
     * La liste a changé (page suivante, rafraîchissement) : le serveur fait foi pour les posts qui n'ont ni delta ni
     * geste en vol — un cœur retiré ailleurs se retire ici, un favori ou une republication servis s'ajoutent.
     */
    fun reconciledWith(posts: List<ApiPost>): FeedPostEngagementState {
        var liked = likedIds
        posts.filter { it.id !in likeDelta && it.id !in heartInFlightIds }.forEach { post ->
            liked = if (post.isLikedByMe == true) liked + post.id else liked - post.id
        }
        val bookmarked = bookmarkedIds + posts
            .filter { it.isBookmarkedByMe == true && it.id !in bookmarkDelta && it.id !in bookmarkInFlightIds }
            .map { it.id }
        val reposted = repostedIds + posts
            .filter { it.isRepostedByMe == true && it.id !in repostDelta && it.id !in repostInFlightIds }
            .map { it.id }
        if (liked == likedIds && bookmarked == bookmarkedIds && reposted == repostedIds) return this
        return copy(likedIds = liked, bookmarkedIds = bookmarked, repostedIds = reposted)
    }

    /** Le cœur du lecteur bascule sous son doigt : l'id et le delta du compteur bougent ensemble. */
    fun heartToggled(postId: String): FeedPostEngagementState {
        val nowLiked = postId !in likedIds
        return copy(
            likedIds = if (nowLiked) likedIds + postId else likedIds - postId,
            likeDelta = likeDelta.plus(postId, if (nowLiked) 1 else -1),
            heartInFlightIds = heartInFlightIds + postId,
        )
    }

    /** La réponse du serveur au cœur : le geste n'est plus en vol. */
    fun heartSettled(postId: String): FeedPostEngagementState =
        if (postId in heartInFlightIds) copy(heartInFlightIds = heartInFlightIds - postId) else this

    /** Le serveur a refusé le geste : le cœur revient à [wasLiked] et le compteur reprend le delta inverse. */
    fun heartRolledBack(postId: String, wasLiked: Boolean): FeedPostEngagementState = copy(
        likedIds = if (wasLiked) likedIds + postId else likedIds - postId,
        likeDelta = likeDelta.plus(postId, if (wasLiked) 1 else -1),
        heartInFlightIds = heartInFlightIds - postId,
    )

    /** Le favori bascule sous le doigt du lecteur. */
    fun bookmarkToggled(postId: String): FeedPostEngagementState {
        val nowBookmarked = postId !in bookmarkedIds
        return copy(
            bookmarkedIds = if (nowBookmarked) bookmarkedIds + postId else bookmarkedIds - postId,
            bookmarkDelta = bookmarkDelta.plus(postId, if (nowBookmarked) 1 else -1),
            bookmarkInFlightIds = bookmarkInFlightIds + postId,
        )
    }

    fun bookmarkSettled(postId: String): FeedPostEngagementState =
        if (postId in bookmarkInFlightIds) copy(bookmarkInFlightIds = bookmarkInFlightIds - postId) else this

    fun bookmarkRolledBack(postId: String, wasBookmarked: Boolean): FeedPostEngagementState = copy(
        bookmarkedIds = if (wasBookmarked) bookmarkedIds + postId else bookmarkedIds - postId,
        bookmarkDelta = bookmarkDelta.plus(postId, if (wasBookmarked) 1 else -1),
        bookmarkInFlightIds = bookmarkInFlightIds - postId,
    )

    /** `post:liked` : le compteur ABSOLU du serveur fait autorité (le delta est purgé) ; l'id ne bouge que pour le lecteur. */
    fun postLiked(postId: String, userId: String, currentUserId: String?): FeedPostEngagementState = copy(
        likedIds = if (userId == currentUserId) likedIds + postId else likedIds,
        likeDelta = likeDelta - postId,
    )

    fun postUnliked(postId: String, userId: String, currentUserId: String?): FeedPostEngagementState = copy(
        likedIds = if (userId == currentUserId) likedIds - postId else likedIds,
        likeDelta = likeDelta - postId,
    )

    /** Un ❤️ ajouté en réaction : le lecteur allume son cœur, tout autre auteur déplace le compteur d'un cran. */
    fun reactionAdded(emoji: String, userId: String, postId: String, currentUserId: String?): FeedPostEngagementState = when {
        emoji != HEART_EMOJI -> this
        userId == currentUserId -> copy(likedIds = likedIds + postId)
        else -> copy(likeDelta = likeDelta.plus(postId, 1))
    }

    fun reactionRemoved(emoji: String, userId: String, postId: String, currentUserId: String?): FeedPostEngagementState = when {
        emoji != HEART_EMOJI -> this
        userId == currentUserId -> copy(likedIds = likedIds - postId)
        else -> copy(likeDelta = likeDelta.plus(postId, -1))
    }

    /**
     * `post:bookmarked` (événement PERSONNEL, toujours pour le lecteur). Sans compteur absolu (vieille passerelle) le
     * delta est gardé : dégradation gracieuse.
     */
    fun postBookmarked(postId: String, bookmarked: Boolean, hasAbsoluteCount: Boolean): FeedPostEngagementState = copy(
        bookmarkedIds = if (bookmarked) bookmarkedIds + postId else bookmarkedIds - postId,
        bookmarkDelta = if (hasAbsoluteCount) bookmarkDelta - postId else bookmarkDelta,
    )

    private fun shown(served: Int?, delta: Int?): Int = maxOf(0, (served ?: 0) + (delta ?: 0))

    companion object {
        /** La réaction qui vaut « j'aime » (iOS `StoryViewerView.heartEmoji`). */
        const val HEART_EMOJI: String = "❤️"
    }
}

private fun Map<String, Int>.plus(key: String, by: Int): Map<String, Int> = this + (key to (this[key] ?: 0) + by)

/** Ce qu'UNE carte du fil lit de l'engagement : des valeurs, jamais l'état (iOS `FeedPostEngagementSnapshot`). */
data class FeedPostEngagementSnapshot(
    val isLiked: Boolean,
    val displayLikeCount: Int,
    val isHeartInFlight: Boolean,
    val isBookmarked: Boolean,
    val isBookmarkInFlight: Boolean,
    val displayBookmarkCount: Int,
    val isReposted: Boolean,
    val isRepostInFlight: Boolean,
    val displayRepostCount: Int,
    val isShareInFlight: Boolean,
    val displayShareCount: Int,
)
