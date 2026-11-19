package me.meeshy.sdk.post

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostEngagementPatch
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.socket.collectArrived
import timber.log.Timber

/**
 * #18931 — the live gestures on a post reach EVERY cached copy of it, whatever screen is open, as iOS
 * `CacheCoordinator.subscribeToPostEngagement` does: `post:liked` / `post:unliked` and `comment:added` /
 * `comment:deleted` write the gateway's ABSOLUTE counts ([PostEngagementPatch]) into the feed and its detail
 * ([PostRepository]) and into every author's grid ([UserPostsCacheRepository]); `post:deleted` takes the post out of all
 * of them; `post:bookmarked` (the viewer's own) also reaches the saved posts' disk copy (#19426). They only reached the feed's in-memory overlay: the profile grid opened after a like showed the old count, and
 * a post deleted elsewhere stayed in it.
 *
 * The heart follows only the viewer's OWN gesture; anyone's moves the count. The writes run one at a time ([writes]): a
 * like and a comment landing together never lose each other on the same cached page. Each event is isolated: a failed
 * write is logged and the next one runs.
 */
@Singleton
class PostEngagementBinding @Inject constructor(
    private val socket: SocialSocketManager,
    private val posts: PostRepository,
    private val userPosts: UserPostsCacheRepository,
    private val session: SessionRepository,
    @IoDispatcher io: CoroutineDispatcher,
) : RealtimeBinding {
    private val scope = CoroutineScope(SupervisorJob() + io)
    private val writes = Mutex()
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = scope.launch {
            launch { socket.postLiked.collectArrived { liked(it.postId, it.likesCount, it.userId, liked = true) } }
            launch { socket.postUnliked.collectArrived { liked(it.postId, it.likesCount, it.userId, liked = false) } }
            launch { socket.commentAdded.collectArrived { everywhere(it.postId) { post -> PostEngagementPatch.commented(post, it.commentCount) } } }
            launch { socket.commentDeleted.collectArrived { everywhere(it.postId) { post -> PostEngagementPatch.commented(post, it.commentCount) } } }
            launch { socket.postBookmarked.collectArrived { saved(it.postId, it.bookmarked, it.bookmarkCount) } }
            launch { socket.postDeleted.collectArrived { removed(it.postId) } }
        }
    }

    override fun detach() {
        job?.cancel()
        job = null
    }

    private suspend fun liked(postId: String, count: Int, actorId: String, liked: Boolean) {
        val mine = liked.takeIf { actorId.isNotBlank() && actorId == session.currentUser.value?.id }
        everywhere(postId) { PostEngagementPatch.liked(it, count, mine) }
    }

    /**
     * `post:bookmarked` is personal to the viewer: every copy takes the state, an un-saved post leaves the saved list, and
     * a post saved that the list lacks makes it revalidate at the next open (#19426).
     */
    private suspend fun saved(postId: String, bookmarked: Boolean, count: Int) = isolated(postId) {
        val ticket = userPosts.ticket()
        val patch = { post: ApiPost -> PostEngagementPatch.bookmarked(post, bookmarked, count) }
        posts.applyEngagement(postId, patch)
        userPosts.patchEverywhere(postId, patch, ticket)
        if (bookmarked) userPosts.bookmarkedElsewhere(postId, ticket) else userPosts.removeFromBookmarks(postId, ticket)
    }

    private suspend fun everywhere(postId: String, patch: (ApiPost) -> ApiPost?) = isolated(postId) {
        val ticket = userPosts.ticket()
        posts.applyEngagement(postId, patch)
        userPosts.patchEverywhere(postId, patch, ticket)
    }

    private suspend fun removed(postId: String) = isolated(postId) {
        val ticket = userPosts.ticket()
        posts.applyDeletion(postId)
        userPosts.removeEverywhere(postId, ticket)
    }

    private suspend fun isolated(postId: String, write: suspend () -> Unit) {
        if (postId.isBlank()) return
        try {
            writes.withLock { write() }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "Gestes vivants sur un post : écriture en échec")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PostEngagementModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: PostEngagementBinding): RealtimeBinding
}
