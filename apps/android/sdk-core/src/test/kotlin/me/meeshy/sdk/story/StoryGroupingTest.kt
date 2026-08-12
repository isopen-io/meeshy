package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import org.junit.Test
import java.time.Instant

/**
 * Faithful port of `StoryModelsTests` grouping/ordering/expiry coverage
 * (`Array<APIPost>.toStoryGroups`, `StoryGroup.hasUnviewed/latestStory`,
 * `StoryItem.isExpired`). Pure logic — `now` is injected.
 */
class StoryGroupingTest {

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()

    private fun storyPost(
        id: String,
        authorId: String,
        authorName: String = authorId,
        createdAt: String,
        viewed: Boolean = false,
        expiresAt: String? = null,
        type: String = "STORY",
    ) = ApiPost(
        id = id,
        type = type,
        content = "hello",
        createdAt = createdAt,
        expiresAt = expiresAt,
        author = ApiAuthor(id = authorId, username = authorName),
        isViewedByMe = viewed,
    )

    private fun isoAgo(hours: Long): String =
        Instant.ofEpochMilli(now - hours * 60 * 60 * 1000).toString()

    @Test
    fun `non-story posts are filtered out`() {
        val posts = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(1)),
            storyPost("p2", "u2", createdAt = isoAgo(1), type = "POST"),
            storyPost("p3", "u3", createdAt = isoAgo(1), type = "STATUS"),
        )
        val groups = posts.toStoryGroups(nowMillis = now)
        assertThat(groups.map { it.id }).containsExactly("u1")
    }

    @Test
    fun `posts group by author and sort stories oldest-first`() {
        val posts = listOf(
            storyPost("b", "u1", createdAt = isoAgo(1)),
            storyPost("a", "u1", createdAt = isoAgo(3)),
            storyPost("c", "u1", createdAt = isoAgo(2)),
        )
        val groups = posts.toStoryGroups(nowMillis = now)
        assertThat(groups).hasSize(1)
        assertThat(groups[0].stories.map { it.id }).containsExactly("a", "c", "b").inOrder()
        assertThat(groups[0].latestStory()?.id).isEqualTo("b")
    }

    @Test
    fun `current user group is pinned first`() {
        val posts = listOf(
            storyPost("p1", "other", createdAt = isoAgo(1)),
            storyPost("p2", "me", createdAt = isoAgo(5), viewed = true),
        )
        val groups = posts.toStoryGroups(currentUserId = "me", nowMillis = now)
        assertThat(groups.first().id).isEqualTo("me")
    }

    @Test
    fun `unviewed groups sort before fully-viewed groups`() {
        val posts = listOf(
            storyPost("p1", "seen", createdAt = isoAgo(1), viewed = true),
            storyPost("p2", "fresh", createdAt = isoAgo(5), viewed = false),
        )
        val groups = posts.toStoryGroups(nowMillis = now)
        assertThat(groups.map { it.id }).containsExactly("fresh", "seen").inOrder()
    }

    @Test
    fun `groups with equal viewed-state sort by latest story descending`() {
        val posts = listOf(
            storyPost("p1", "old", createdAt = isoAgo(10)),
            storyPost("p2", "new", createdAt = isoAgo(2)),
        )
        val groups = posts.toStoryGroups(nowMillis = now)
        assertThat(groups.map { it.id }).containsExactly("new", "old").inOrder()
    }

    @Test
    fun `hasUnviewed is true when any story is unseen`() {
        val groups = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(1), viewed = true),
            storyPost("p2", "u1", createdAt = isoAgo(2), viewed = false),
        ).toStoryGroups(nowMillis = now)
        assertThat(groups[0].hasUnviewed()).isTrue()
    }

    @Test
    fun `story with explicit past expiry is expired`() {
        val item = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(2), expiresAt = isoAgo(1)),
        ).toStoryGroups(nowMillis = now)[0].stories[0]
        assertThat(item.isExpired(now)).isTrue()
    }

    @Test
    fun `story without explicit expiry uses 21h window so a 1h-old story is live`() {
        val groups = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(1)),
        ).toStoryGroups(nowMillis = now)
        assertThat(groups[0].stories[0].isExpired(now)).isFalse()
        assertThat(groups[0].isFullyExpired(now)).isFalse()
    }

    @Test
    fun `a group whose stories are all past the 21h window is fully expired`() {
        val groups = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(30)),
        ).toStoryGroups(nowMillis = now)
        assertThat(groups[0].stories[0].isExpired(now)).isTrue()
        assertThat(groups[0].isFullyExpired(now)).isTrue()
    }
}
