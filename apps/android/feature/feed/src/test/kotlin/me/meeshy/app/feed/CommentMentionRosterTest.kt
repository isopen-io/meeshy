package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import org.junit.Test

class CommentMentionRosterTest {

    private fun comment(
        id: String,
        authorId: String? = "u-$id",
        username: String? = "user$id",
        displayName: String? = "User $id",
        avatar: String? = null,
    ) = ApiPostComment(
        id = id,
        author = authorId?.let { ApiAuthor(id = it, username = username, displayName = displayName, avatar = avatar) },
    )

    @Test
    fun `build on an empty thread yields no candidates`() {
        assertThat(CommentMentionRoster.build(emptyList(), excludeUserId = null)).isEmpty()
    }

    @Test
    fun `build maps an author to a candidate carrying handle, name and avatar`() {
        val roster = CommentMentionRoster.build(
            listOf(comment("1", authorId = "u-1", username = "alice", displayName = "Alice Smith", avatar = "a.png")),
            excludeUserId = null,
        )

        assertThat(roster).hasSize(1)
        val candidate = roster.single()
        assertThat(candidate.id).isEqualTo("u-1")
        assertThat(candidate.username).isEqualTo("alice")
        assertThat(candidate.displayName).isEqualTo("Alice Smith")
        assertThat(candidate.avatarURL).isEqualTo("a.png")
    }

    @Test
    fun `build drops a comment whose author is absent`() {
        val roster = CommentMentionRoster.build(
            listOf(comment("1", authorId = null), comment("2", username = "bob")),
            excludeUserId = null,
        )

        assertThat(roster.map { it.username }).containsExactly("bob")
    }

    @Test
    fun `build drops an author with a blank handle`() {
        val roster = CommentMentionRoster.build(
            listOf(comment("1", username = "   "), comment("2", username = null), comment("3", username = "carol")),
            excludeUserId = null,
        )

        assertThat(roster.map { it.username }).containsExactly("carol")
    }

    @Test
    fun `build trims a whitespace-padded handle`() {
        val roster = CommentMentionRoster.build(
            listOf(comment("1", username = "  dave  ")),
            excludeUserId = null,
        )

        assertThat(roster.single().username).isEqualTo("dave")
    }

    @Test
    fun `build degrades an absent display name to the handle`() {
        val roster = CommentMentionRoster.build(
            listOf(comment("1", username = "erin", displayName = null)),
            excludeUserId = null,
        )

        assertThat(roster.single().displayName).isEqualTo("erin")
    }

    @Test
    fun `build degrades a blank display name to the handle`() {
        val roster = CommentMentionRoster.build(
            listOf(comment("1", username = "frank", displayName = "   ")),
            excludeUserId = null,
        )

        assertThat(roster.single().displayName).isEqualTo("frank")
    }

    @Test
    fun `build excludes the current user by id`() {
        val roster = CommentMentionRoster.build(
            listOf(comment("1", authorId = "me", username = "self"), comment("2", authorId = "u-2", username = "grace")),
            excludeUserId = "me",
        )

        assertThat(roster.map { it.username }).containsExactly("grace")
    }

    @Test
    fun `build dedups a repeated handle case-insensitively, first occurrence winning`() {
        val roster = CommentMentionRoster.build(
            listOf(
                comment("1", authorId = "u-1", username = "heidi", displayName = "Heidi One"),
                comment("2", authorId = "u-2", username = "HEIDI", displayName = "Heidi Two"),
            ),
            excludeUserId = null,
        )

        assertThat(roster).hasSize(1)
        assertThat(roster.single().displayName).isEqualTo("Heidi One")
    }

    @Test
    fun `build preserves encounter order across distinct authors`() {
        val roster = CommentMentionRoster.build(
            listOf(comment("1", username = "ivan"), comment("2", username = "judy"), comment("3", username = "karl")),
            excludeUserId = null,
        )

        assertThat(roster.map { it.username }).containsExactly("ivan", "judy", "karl").inOrder()
    }
}
