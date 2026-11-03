package me.meeshy.app.feed

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.PostTranslationMerge
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.SocketPostRepostedData
import me.meeshy.sdk.model.postTypeFromWire
import me.meeshy.sdk.model.profile.PostEngagementPatches
import me.meeshy.sdk.socket.SocialSocketManager

/**
 * Le temps réel de l'onglet Postes (iOS `ProfileUserPostsViewModel.subscribeToSocketUpdates`) : chaque événement
 * est une fonction PURE de l'état du modèle, pour que l'ordre d'arrivée se prouve sans socket. Un total absolu
 * (`post:liked`) devient la nouvelle base ; la surcharge du lecteur ne se lève qu'à l'écho de SA action.
 */
internal object ProfilePostsRealtime {

    fun liked(model: ProfilePostsInternal, postId: String, actorId: String, absolute: Int, liked: Boolean, me: String?): ProfilePostsInternal {
        if (model.posts.none { it.id == postId }) return model
        val mine = actorId == me
        return model.copy(
            posts = model.posts.mapPost(postId) { PostEngagementPatches.liked(it, absolute, mine, liked) },
            overlay = model.overlay.afterLikeEcho(postId, mine),
        )
    }

    fun commentCount(model: ProfilePostsInternal, postId: String, count: Int): ProfilePostsInternal =
        if (model.posts.none { it.id == postId }) model
        else model.copy(posts = model.posts.mapPost(postId) { PostEngagementPatches.commentCount(it, count) })

    fun bookmarked(model: ProfilePostsInternal, postId: String, bookmarked: Boolean, absolute: Int?): ProfilePostsInternal =
        if (model.posts.none { it.id == postId }) model
        else model.copy(
            posts = model.posts.mapPost(postId) { PostEngagementPatches.bookmarked(it, bookmarked, absolute) },
            overlay = model.overlay.afterBookmarkEcho(postId),
        )

    /**
     * `post:reposted`, dédupliqué par l'id du repost. Le compteur vaut pour l'original ; la GRILLE ne reçoit que le
     * repost du profil consulté, jamais une story ou un statut (ils vivent dans le plateau).
     */
    fun reposted(model: ProfilePostsInternal, data: SocketPostRepostedData, profileUserId: String?, me: String?): ProfilePostsInternal {
        val (overlay, fresh) = model.overlay.afterRepostEcho(data.repost.id, data.originalPostId, byMe = data.repost.author?.id == me)
        if (!fresh) return model
        val counted = model.posts.mapPost(data.originalPostId) { PostEngagementPatches.reposted(it, byMe = data.repost.author?.id == me) }
        val belongsToTray = postTypeFromWire(data.repost.type) in TRAY_TYPES
        val joinsHead = !belongsToTray && data.repost.author?.id == profileUserId && counted.none { it.id == data.repost.id }
        return model.copy(overlay = overlay, posts = if (joinsHead) listOf(data.repost) + counted else counted)
    }

    fun deleted(model: ProfilePostsInternal, postId: String): ProfilePostsInternal =
        if (model.posts.none { it.id == postId }) model else model.copy(posts = model.posts.filterNot { it.id == postId })

    /** `post:updated` : la diffusion ne porte pas l'état personnel du lecteur, il se reprend de l'exemplaire local. */
    fun updated(model: ProfilePostsInternal, updated: ApiPost): ProfilePostsInternal {
        if (model.posts.none { it.id == updated.id }) return model
        return model.copy(
            posts = model.posts.mapPost(updated.id) { local ->
                updated.copy(
                    isLikedByMe = local.isLikedByMe,
                    isBookmarkedByMe = local.isBookmarkedByMe,
                    isRepostedByMe = local.isRepostedByMe,
                )
            },
        )
    }

    /** Une traduction arrivée (demandée par drapeau de langue non chargé) se range dans le post. */
    fun translated(model: ProfilePostsInternal, postId: String, language: String, entry: ApiPostTranslationEntry): ProfilePostsInternal {
        if (model.posts.none { it.id == postId }) return model
        return model.copy(posts = model.posts.mapPost(postId) { PostTranslationMerge.mergeTranslation(it, language, entry) ?: it })
    }

    private val TRAY_TYPES = setOf(PostType.STORY, PostType.STATUS)
}

private inline fun List<ApiPost>.mapPost(postId: String, transform: (ApiPost) -> ApiPost): List<ApiPost> =
    map { if (it.id == postId) transform(it) else it }

/**
 * Branche les événements sociaux sur [update]. Le join du fil est idempotent et JAMAIS quitté ici : le
 * `feed:unsubscribe` appartient au fil. Chaque écouteur est enveloppé d'un try/catch (un événement illisible ne
 * tue pas la collecte).
 */
internal fun CoroutineScope.collectProfilePostsRealtime(
    socket: SocialSocketManager,
    profileUserId: () -> String?,
    currentUserId: () -> String?,
    update: ((ProfilePostsInternal) -> ProfilePostsInternal) -> Unit,
) {
    socket.subscribeFeed()
    fun <T> listen(flow: kotlinx.coroutines.flow.Flow<T>, apply: (ProfilePostsInternal, T) -> ProfilePostsInternal) {
        launch {
            flow.collect { event ->
                try {
                    update { apply(it, event) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Un événement illisible est ignoré : la collecte continue.
                }
            }
        }
    }
    listen(socket.postLiked) { m, e -> ProfilePostsRealtime.liked(m, e.postId, e.userId, e.likesCount, true, currentUserId()) }
    listen(socket.postUnliked) { m, e -> ProfilePostsRealtime.liked(m, e.postId, e.userId, e.likesCount, false, currentUserId()) }
    listen(socket.commentAdded) { m, e -> ProfilePostsRealtime.commentCount(m, e.postId, e.commentCount) }
    listen(socket.commentDeleted) { m, e -> ProfilePostsRealtime.commentCount(m, e.postId, e.commentCount) }
    listen(socket.postBookmarked) { m, e -> ProfilePostsRealtime.bookmarked(m, e.postId, e.bookmarked, e.bookmarkCount) }
    listen(socket.postReposted) { m, e -> ProfilePostsRealtime.reposted(m, e, profileUserId(), currentUserId()) }
    listen(socket.postDeleted) { m, e -> ProfilePostsRealtime.deleted(m, e.postId) }
    listen(socket.postUpdated) { m, e -> ProfilePostsRealtime.updated(m, e.post) }
    listen(socket.postTranslationUpdated) { m, e -> ProfilePostsRealtime.translated(m, e.postId, e.language, e.translation) }
}
