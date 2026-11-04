package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.ApiPost

/**
 * Les surcharges OPTIMISTES de l'onglet Postes d'une fiche (miroir de `likedOverrides` / `bookmarkedOverrides` /
 * `repostedOverrides` / `shareDelta` de `ProfileUserPostsViewModel` iOS). Une surcharge dit ce que le lecteur
 * vient de faire ; le compteur affiché est la base servie ajustée d'UN cran quand la surcharge diffère du drapeau
 * servi, jamais sous zéro. Un total absolu reçu par socket devient la nouvelle base (voir [PostEngagementPatches]) :
 * la surcharge ne se lève qu'à l'écho de sa propre action.
 *
 * Un repost est APPEND-ONLY : la surcharge ne dit jamais « non reposté » ; un refus du serveur la retire.
 */
data class PostEngagementOverlay(
    val liked: Map<String, Boolean> = emptyMap(),
    val bookmarked: Map<String, Boolean> = emptyMap(),
    val reposted: Map<String, Boolean> = emptyMap(),
    val shareDelta: Map<String, Int> = emptyMap(),
    val seenRepostIds: Set<String> = emptySet(),
) {
    fun isLiked(post: ApiPost): Boolean = liked[post.id] ?: (post.isLikedByMe == true)
    fun isBookmarked(post: ApiPost): Boolean = bookmarked[post.id] ?: (post.isBookmarkedByMe == true)
    fun isReposted(post: ApiPost): Boolean = reposted[post.id] ?: (post.isRepostedByMe == true)

    fun likeCount(post: ApiPost): Int = adjusted(post.likeCount, post.isLikedByMe == true, liked[post.id])
    fun bookmarkCount(post: ApiPost): Int = adjusted(post.bookmarkCount, post.isBookmarkedByMe == true, bookmarked[post.id])
    fun repostCount(post: ApiPost): Int = adjusted(post.repostCount, post.isRepostedByMe == true, reposted[post.id])
    fun shareCount(post: ApiPost): Int = maxOf(0, (post.shareCount ?: 0) + (shareDelta[post.id] ?: 0))

    /** Un repost ne se rejoue pas : déjà fait (servi ou surchargé), le toucher est sans effet. */
    fun canRepost(post: ApiPost): Boolean = !isReposted(post)

    fun withLike(postId: String, value: Boolean): PostEngagementOverlay = copy(liked = liked + (postId to value))
    fun withBookmark(postId: String, value: Boolean): PostEngagementOverlay = copy(bookmarked = bookmarked + (postId to value))
    fun withRepost(postId: String): PostEngagementOverlay = copy(reposted = reposted + (postId to true))
    fun withoutRepost(postId: String): PostEngagementOverlay = copy(reposted = reposted - postId)
    fun sharedOnce(postId: String): PostEngagementOverlay = copy(shareDelta = shareDelta + (postId to (shareDelta[postId] ?: 0) + 1))

    /** Le partage n'a pas abouti : le cran ajouté au toucher est repris. */
    fun unsharedOnce(postId: String): PostEngagementOverlay {
        val next = (shareDelta[postId] ?: 0) - 1
        return copy(shareDelta = if (next == 0) shareDelta - postId else shareDelta + (postId to next))
    }

    /** `post:liked` / `post:unliked` : seul l'écho de MA propre action lève ma surcharge. */
    fun afterLikeEcho(postId: String, actorIsMe: Boolean): PostEngagementOverlay =
        if (actorIsMe) copy(liked = liked - postId) else this

    /** `post:bookmarked` est personnel : il lève toujours la surcharge. */
    fun afterBookmarkEcho(postId: String): PostEngagementOverlay = copy(bookmarked = bookmarked - postId)

    /**
     * `post:reposted` : dédupliqué par l'id du repost. Rend l'état suivant et si l'événement est NEUF ;
     * l'écho de mon repost lève ma surcharge.
     */
    fun afterRepostEcho(repostId: String, originalPostId: String, byMe: Boolean): Pair<PostEngagementOverlay, Boolean> {
        if (repostId in seenRepostIds) return this to false
        val next = copy(
            seenRepostIds = seenRepostIds + repostId,
            reposted = if (byMe) reposted - originalPostId else reposted,
        )
        return next to true
    }

    /** Après une page : retire les surcharges d'un post disparu ou déjà rattrapé par la valeur servie. */
    fun reconciledWith(posts: List<ApiPost>): PostEngagementOverlay {
        val byId = posts.associateBy { it.id }
        return copy(
            liked = liked.filter { (id, v) -> byId[id]?.let { (it.isLikedByMe == true) != v } == true },
            bookmarked = bookmarked.filter { (id, v) -> byId[id]?.let { (it.isBookmarkedByMe == true) != v } == true },
            reposted = reposted.filter { (id, v) -> byId[id]?.let { (it.isRepostedByMe == true) != v } == true },
            shareDelta = shareDelta.filterKeys { it in byId },
        )
    }

    private fun adjusted(base: Int?, servedFlag: Boolean, override: Boolean?): Int {
        val served = base ?: 0
        if (override == null || override == servedFlag) return served
        return maxOf(0, served + if (override) 1 else -1)
    }
}

/** Les patchs de la liste servie que portent les événements sociaux (iOS `applyLike`, `applyCommentCount`, …). */
object PostEngagementPatches {

    /** Le total ABSOLU devient la base ; le drapeau « aimé » ne bouge que pour MOI. */
    fun liked(post: ApiPost, absolute: Int, actorIsMe: Boolean, liked: Boolean): ApiPost =
        post.copy(likeCount = absolute, isLikedByMe = if (actorIsMe) liked else post.isLikedByMe)

    fun commentCount(post: ApiPost, count: Int): ApiPost = post.copy(commentCount = count)

    /** [absolute] `null` (vieille passerelle) laisse le compteur en l'état. */
    fun bookmarked(post: ApiPost, bookmarked: Boolean, absolute: Int?): ApiPost =
        post.copy(isBookmarkedByMe = bookmarked, bookmarkCount = absolute ?: post.bookmarkCount)

    /** Tout repost compte pour l'original ; le drapeau ne s'allume que pour MOI. */
    fun reposted(post: ApiPost, byMe: Boolean): ApiPost =
        post.copy(repostCount = (post.repostCount ?: 0) + 1, isRepostedByMe = if (byMe) true else post.isRepostedByMe)
}
