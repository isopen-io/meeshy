package me.meeshy.sdk.post

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #18931 — a like, a comment or a deletion received live reaches every cached copy of the post: the feed and the grid of
 * its author's profile. They only reached the feed's in-memory overlay: the grid opened after a like showed the old
 * count, and a post deleted elsewhere stayed in it.
 */
@RunWith(RobolectricTestRunner::class)
class PostEngagementBindingTest {

    private val db: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()

    private val liked = MutableSharedFlow<SocketPostLikedData>(extraBufferCapacity = 8)
    private val unliked = MutableSharedFlow<SocketPostUnlikedData>(extraBufferCapacity = 8)
    private val commentAdded = MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 8)
    private val commentDeleted = MutableSharedFlow<SocketCommentDeletedData>(extraBufferCapacity = 8)
    private val deleted = MutableSharedFlow<SocketPostDeletedData>(extraBufferCapacity = 8)

    private val socket = mockk<SocialSocketManager> {
        every { postLiked } returns liked
        every { postUnliked } returns unliked
        every { commentAdded } returns this@PostEngagementBindingTest.commentAdded
        every { commentDeleted } returns this@PostEngagementBindingTest.commentDeleted
        every { postDeleted } returns deleted
    }
    private val api: PostApi = mockk(relaxed = true)
    private val posts = PostRepository(api, mockk(relaxed = true), mockk(relaxed = true))
    private val userPosts = UserPostsCacheRepository(db.profileStatsCacheDao())
    private val session = mockk<SessionRepository> {
        every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
    }
    private val binding = PostEngagementBinding(socket, posts, userPosts, session, Dispatchers.Default)

    private val post = ApiPost(id = "p1", content = "salut", likeCount = 3, commentCount = 1, isLikedByMe = false)
    private val other = ApiPost(id = "p9", content = "autre", likeCount = 8)

    @After
    fun tearDown() {
        binding.detach()
        db.close()
    }

    private suspend fun seeded() {
        coEvery { api.getFeed(null, any()) } returns
            ApiResponse(success = true, data = listOf(post, other), pagination = Pagination(nextCursor = null, hasMore = false))
        posts.refresh()
        userPosts.persist("author", UserPostsSnapshot(posts = listOf(post)), ticket = null)
        userPosts.persist("someone", UserPostsSnapshot(posts = listOf(other)), ticket = null)
        binding.attach()
        waitForSubscribers()
    }

    private suspend fun waitForSubscribers() = eventually {
        listOf(liked, unliked, commentAdded, commentDeleted, deleted).all { it.subscriptionCount.value > 0 }
    }

    private suspend fun eventually(condition: suspend () -> Boolean) = withContext(Dispatchers.Default) {
        withTimeout(5_000) { while (!condition()) delay(10) }
    }

    private suspend fun grid(userId: String): List<ApiPost> = userPosts.cached(userId).valueOrNull?.posts.orEmpty()

    @Test
    fun `a like received live reaches the feed and the profile grid, its heart left alone`() = runTest {
        seeded()

        liked.emit(SocketPostLikedData(postId = "p1", userId = "u-peer", likesCount = 7))

        eventually { grid("author").single().likeCount == 7 && posts.cachedPost("p1")?.likeCount == 7 }
        assertThat(posts.cachedPost("p1")!!.isLikedByMe).isFalse()
        assertThat(grid("author").single().isLikedByMe).isFalse()
        assertThat(grid("someone").single()).isEqualTo(other)
    }

    @Test
    fun `my own like received live lights the heart in every copy, and my unlike turns it off`() = runTest {
        seeded()

        liked.emit(SocketPostLikedData(postId = "p1", userId = "me", likesCount = 4))
        eventually { grid("author").single().isLikedByMe == true && posts.cachedPost("p1")?.isLikedByMe == true }

        unliked.emit(SocketPostUnlikedData(postId = "p1", userId = "me", likesCount = 3))
        eventually { grid("author").single().isLikedByMe == false && posts.cachedPost("p1")?.isLikedByMe == false }
        assertThat(grid("author").single().likeCount).isEqualTo(3)
    }

    @Test
    fun `a comment added or deleted live takes the served comment count everywhere`() = runTest {
        seeded()

        commentAdded.emit(SocketCommentAddedData(postId = "p1", comment = ApiPostComment(id = "k1"), commentCount = 5))
        eventually { grid("author").single().commentCount == 5 && posts.cachedPost("p1")?.commentCount == 5 }

        commentDeleted.emit(SocketCommentDeletedData(postId = "p1", commentId = "k1", commentCount = 4))
        eventually { grid("author").single().commentCount == 4 && posts.cachedPost("p1")?.commentCount == 4 }
    }

    @Test
    fun `a post deleted elsewhere leaves the feed and the profile grid`() = runTest {
        seeded()

        deleted.emit(SocketPostDeletedData(postId = "p1"))

        eventually { grid("author").isEmpty() && posts.cachedPost("p1") == null }
        assertThat(posts.cachedPost("p9")).isNotNull()
        assertThat(grid("someone").single()).isEqualTo(other)
    }
}
