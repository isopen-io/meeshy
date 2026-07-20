package me.meeshy.sdk.status

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.Test

/**
 * Behavioural coverage for the pure `ApiPost -> StatusEntry` mapping + bar ordering —
 * the Android port of `APIPost.toStatusEntry()` (StoryModels.swift) and the
 * `StatusViewModel` bar-projection (own status first, then others, deduped). Pure logic.
 * Android surpasses iOS by carrying `visibility` + `reactionSummary` through the mapper
 * (the iOS converter drops both).
 */
class StatusMapperTest {

    private fun statusPost(
        id: String,
        authorId: String = "u1",
        displayName: String? = "Alice",
        username: String? = "alice",
        moodEmoji: String? = "🔥",
        type: String = "STATUS",
        content: String? = "vibing",
        visibility: String? = "FRIENDS",
        reactionSummary: Map<String, Int>? = mapOf("❤️" to 2),
        viaUsername: String? = null,
        repostOf: ApiRepostOf? = null,
    ) = ApiPost(
        id = id,
        type = type,
        content = content,
        visibility = visibility,
        createdAt = "2026-06-17T12:00:00Z",
        expiresAt = "2026-06-17T13:00:00Z",
        author = ApiAuthor(id = authorId, username = username, displayName = displayName),
        reactionSummary = reactionSummary,
        moodEmoji = moodEmoji,
        audioUrl = "https://cdn/audio.m4a",
        viaUsername = viaUsername,
        repostOf = repostOf,
    )

    // --- toStatusEntry ---------------------------------------------------------

    @Test
    fun `maps a status post into a status entry with all fields`() {
        val entry = statusPost(id = "s1").toStatusEntry()!!
        assertThat(entry.id).isEqualTo("s1")
        assertThat(entry.userId).isEqualTo("u1")
        assertThat(entry.username).isEqualTo("Alice")
        assertThat(entry.moodEmoji).isEqualTo("🔥")
        assertThat(entry.content).isEqualTo("vibing")
        assertThat(entry.audioUrl).isEqualTo("https://cdn/audio.m4a")
        assertThat(entry.createdAt).isEqualTo("2026-06-17T12:00:00Z")
        assertThat(entry.expiresAt).isEqualTo("2026-06-17T13:00:00Z")
    }

    @Test
    fun `avatar colour is derived deterministically from the resolved name`() {
        val entry = statusPost(id = "s1").toStatusEntry()!!
        assertThat(entry.avatarColor).isEqualTo(DynamicColorGenerator.colorForName("Alice"))
    }

    @Test
    fun `carries visibility and reaction summary through, closing the iOS gap`() {
        val entry = statusPost(id = "s1").toStatusEntry()!!
        assertThat(entry.visibility).isEqualTo("FRIENDS")
        assertThat(entry.reactionSummary).containsExactly("❤️", 2)
    }

    @Test
    fun `status type is matched case-insensitively`() {
        assertThat(statusPost(id = "s1", type = "status").toStatusEntry()).isNotNull()
        assertThat(statusPost(id = "s1", type = "Status").toStatusEntry()).isNotNull()
    }

    @Test
    fun `a non-status post maps to null`() {
        assertThat(statusPost(id = "s1", type = "POST").toStatusEntry()).isNull()
        assertThat(statusPost(id = "s1", type = "STORY").toStatusEntry()).isNull()
    }

    @Test
    fun `a post with no type maps to null`() {
        val post = statusPost(id = "s1").copy(type = null)
        assertThat(post.toStatusEntry()).isNull()
    }

    @Test
    fun `a status without a mood emoji maps to null`() {
        assertThat(statusPost(id = "s1", moodEmoji = null).toStatusEntry()).isNull()
        assertThat(statusPost(id = "s1", moodEmoji = "  ").toStatusEntry()).isNull()
    }

    @Test
    fun `a status without an author maps to null`() {
        val post = statusPost(id = "s1").copy(author = null)
        assertThat(post.toStatusEntry()).isNull()
    }

    @Test
    fun `name prefers display name, then username, then Anonymous`() {
        assertThat(statusPost(id = "s1", displayName = "Bob", username = "b").toStatusEntry()!!.username)
            .isEqualTo("Bob")
        assertThat(statusPost(id = "s1", displayName = null, username = "b").toStatusEntry()!!.username)
            .isEqualTo("b")
        assertThat(statusPost(id = "s1", displayName = "  ", username = "b").toStatusEntry()!!.username)
            .isEqualTo("b")
        assertThat(statusPost(id = "s1", displayName = null, username = null).toStatusEntry()!!.username)
            .isEqualTo("Anonymous")
        assertThat(statusPost(id = "s1", displayName = " ", username = " ").toStatusEntry()!!.username)
            .isEqualTo("Anonymous")
    }

    @Test
    fun `via username prefers the explicit field then the repost author`() {
        assertThat(statusPost(id = "s1", viaUsername = "origin").toStatusEntry()!!.viaUsername)
            .isEqualTo("origin")
        val reposted = statusPost(
            id = "s1",
            viaUsername = null,
            repostOf = ApiRepostOf(id = "r1", author = ApiAuthor(id = "u9", username = "sourceUser")),
        )
        assertThat(reposted.toStatusEntry()!!.viaUsername).isEqualTo("sourceUser")
    }

    @Test
    fun `via username is null when neither the field nor a repost author exists`() {
        assertThat(statusPost(id = "s1", viaUsername = null, repostOf = null).toStatusEntry()!!.viaUsername)
            .isNull()
    }

    // --- toStatusEntries -------------------------------------------------------

    @Test
    fun `list mapping keeps only statuses and preserves server order`() {
        val posts = listOf(
            statusPost(id = "s1", authorId = "a"),
            statusPost(id = "p1", type = "POST"),
            statusPost(id = "s2", authorId = "b"),
            statusPost(id = "s3", moodEmoji = null),
        )
        val entries = posts.toStatusEntries()
        assertThat(entries.map { it.id }).containsExactly("s1", "s2").inOrder()
    }

    @Test
    fun `empty list maps to empty`() {
        assertThat(emptyList<ApiPost>().toStatusEntries()).isEmpty()
    }

    // --- orderedForBar ---------------------------------------------------------

    @Test
    fun `bar ordering puts the current user's status first`() {
        val entries = listOf(
            statusPost(id = "s1", authorId = "other").toStatusEntry()!!,
            statusPost(id = "s2", authorId = "me").toStatusEntry()!!,
            statusPost(id = "s3", authorId = "other2").toStatusEntry()!!,
        )
        val ordered = entries.orderedForBar(currentUserId = "me")
        assertThat(ordered.map { it.id }).containsExactly("s2", "s1", "s3").inOrder()
    }

    @Test
    fun `bar ordering with no own status keeps server order`() {
        val entries = listOf(
            statusPost(id = "s1", authorId = "a").toStatusEntry()!!,
            statusPost(id = "s2", authorId = "b").toStatusEntry()!!,
        )
        val ordered = entries.orderedForBar(currentUserId = "me")
        assertThat(ordered.map { it.id }).containsExactly("s1", "s2").inOrder()
    }

    @Test
    fun `bar ordering dedupes by id, first occurrence wins`() {
        val entries = listOf(
            statusPost(id = "s1", authorId = "a").toStatusEntry()!!,
            statusPost(id = "s1", authorId = "a").toStatusEntry()!!,
            statusPost(id = "s2", authorId = "b").toStatusEntry()!!,
        )
        val ordered = entries.orderedForBar(currentUserId = null)
        assertThat(ordered.map { it.id }).containsExactly("s1", "s2").inOrder()
    }

    @Test
    fun `bar ordering of an empty list is empty`() {
        assertThat(emptyList<me.meeshy.sdk.model.StatusEntry>().orderedForBar(currentUserId = "me")).isEmpty()
    }

    @Test
    fun `bar ordering with null current user preserves order and dedupes`() {
        val entries = listOf(
            statusPost(id = "s1", authorId = "me").toStatusEntry()!!,
            statusPost(id = "s2", authorId = "other").toStatusEntry()!!,
        )
        val ordered = entries.orderedForBar(currentUserId = null)
        assertThat(ordered.map { it.id }).containsExactly("s1", "s2").inOrder()
    }
}
