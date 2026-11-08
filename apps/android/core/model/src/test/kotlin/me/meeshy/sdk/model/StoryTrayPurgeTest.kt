package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTrayPurgeTest {
    private val now = 1_800_000_000_000L
    private val hour = 3_600_000L

    private fun iso(millis: Long) = java.time.Instant.ofEpochMilli(millis).toString()

    private fun story(id: String, author: String, createdAgoHours: Long = 1, expiresInHours: Long? = null) = ApiPost(
        id = id,
        type = "STORY",
        createdAt = iso(now - createdAgoHours * hour),
        expiresAt = expiresInHours?.let { iso(now + it * hour) },
        author = ApiAuthor(id = author, username = author),
    )

    @Test
    fun `a deleted id is dead for everyone, the author included`() {
        val posts = listOf(story("a", "me"), story("b", "u1"))
        assertThat(StoryTrayPurge.deadIds(posts, "me", setOf("a", "b"), nowMillis = null)).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `an expired story of another author is dead but the author keeps his own`() {
        val posts = listOf(story("mine", "me", createdAgoHours = 30), story("theirs", "u1", createdAgoHours = 30))
        assertThat(StoryTrayPurge.purging(posts, "me", nowMillis = now).map { it.id }).containsExactly("mine")
    }

    @Test
    fun `without a clock only explicit deletions count`() {
        val posts = listOf(story("old", "u1", createdAgoHours = 40))
        assertThat(StoryTrayPurge.purging(posts, "me", nowMillis = null)).hasSize(1)
    }

    @Test
    fun `a served expiry wins over the 20h fallback`() {
        val posts = listOf(story("live", "u1", createdAgoHours = 30, expiresInHours = 2))
        assertThat(StoryTrayPurge.deadIds(posts, "me", nowMillis = now)).isEmpty()
    }

    @Test
    fun `a story with no date at all is alive`() {
        val undated = ApiPost(id = "x", type = "STORY", author = ApiAuthor(id = "u1", username = "u1"))
        assertThat(StoryTrayPurge.deadIds(listOf(undated), "me", nowMillis = now)).isEmpty()
    }

    @Test
    fun `an author whose every story died leaves no row`() {
        val posts = listOf(story("a", "u1", createdAgoHours = 25), story("b", "u1", createdAgoHours = 26), story("c", "u2"))
        assertThat(StoryTrayPurge.purging(posts, null, nowMillis = now).map { it.author?.id }).containsExactly("u2")
    }
}
