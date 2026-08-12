package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.story.PendingStoryPublish
import org.junit.Test

class StoryOptimisticTrayTest {

    private val self = StoryOptimisticTray.SelfIdentity(id = "me", username = "self", avatar = "a.png")

    private fun publish(
        tempId: String = "pending_1",
        content: String = "hello",
        visibility: String = "PUBLIC",
        language: String? = "fr",
        createdAtMillis: Long = 1_700_000_000_000L,
    ) = PendingStoryPublish(tempId, content, visibility, language, createdAtMillis)

    private fun cached(id: String) =
        ApiPost(id = id, type = "STORY", author = ApiAuthor(id = "me", username = "self"))

    @Test
    fun `no signed-in user yields no optimistic stories`() {
        assertThat(StoryOptimisticTray.pendingStories(listOf(publish()), self = null)).isEmpty()
    }

    @Test
    fun `no publishes yields no optimistic stories`() {
        assertThat(StoryOptimisticTray.pendingStories(emptyList(), self)).isEmpty()
    }

    @Test
    fun `a publish becomes a self-authored story post`() {
        val post = StoryOptimisticTray.pendingStories(listOf(publish()), self).single()

        assertThat(post.id).isEqualTo("pending_1")
        assertThat(post.type).isEqualTo("STORY")
        assertThat(post.content).isEqualTo("hello")
        assertThat(post.visibility).isEqualTo("PUBLIC")
        assertThat(post.originalLanguage).isEqualTo("fr")
        assertThat(post.author?.id).isEqualTo("me")
        assertThat(post.author?.username).isEqualTo("self")
        assertThat(post.author?.avatar).isEqualTo("a.png")
    }

    @Test
    fun `a synthetic story is marked viewed-by-me so it never reads as unviewed`() {
        val post = StoryOptimisticTray.pendingStories(listOf(publish()), self).single()

        assertThat(post.isViewedByMe).isTrue()
    }

    @Test
    fun `the enqueue time becomes the synthetic story createdAt`() {
        val post = StoryOptimisticTray.pendingStories(
            listOf(publish(createdAtMillis = 1_700_000_000_000L)),
            self,
        ).single()

        assertThat(isoToEpochMillis(post.createdAt)).isEqualTo(1_700_000_000_000L)
    }

    @Test
    fun `multiple publishes map in order`() {
        val posts = StoryOptimisticTray.pendingStories(
            listOf(publish(tempId = "pending_1"), publish(tempId = "pending_2")),
            self,
        )

        assertThat(posts.map { it.id }).containsExactly("pending_1", "pending_2").inOrder()
    }

    @Test
    fun `merge with no pending returns the cached feed unchanged`() {
        val cached = listOf(cached("s1"), cached("s2"))

        assertThat(StoryOptimisticTray.merge(cached, emptyList())).isEqualTo(cached)
    }

    @Test
    fun `merge appends pending stories after the cached feed`() {
        val cached = listOf(cached("s1"))
        val pending = StoryOptimisticTray.pendingStories(listOf(publish(tempId = "pending_1")), self)

        assertThat(StoryOptimisticTray.merge(cached, pending).map { it.id })
            .containsExactly("s1", "pending_1").inOrder()
    }

    @Test
    fun `merge drops a pending story whose id is already in the cached feed`() {
        val cached = listOf(cached("pending_1"))
        val pending = StoryOptimisticTray.pendingStories(listOf(publish(tempId = "pending_1")), self)

        assertThat(StoryOptimisticTray.merge(cached, pending).map { it.id })
            .containsExactly("pending_1")
    }

    @Test
    fun `merge into an empty cache returns the pending stories`() {
        val pending = StoryOptimisticTray.pendingStories(listOf(publish(tempId = "pending_1")), self)

        assertThat(StoryOptimisticTray.merge(emptyList(), pending).map { it.id })
            .containsExactly("pending_1")
    }
}
