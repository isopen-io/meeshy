package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import org.junit.Test

/**
 * The comment-thread mention directory SSOT. Aggregates a `username → display name` map from
 * every comment author so that `@Display Name` tokens in a comment's content resolve to a
 * highlighted mention link (via `MessageTextParser`), exactly as chat bubbles do. Mirrors the
 * web `buildMentionDisplayMap` filter (skip a blank handle, skip an absent/blank display name,
 * skip a vanity `displayName == username`) extended to the feed comment thread — the parity
 * with iOS feeding `UserDisplayNameCache` from comment/post authors.
 */
class CommentMentionDirectoryTest {

    private fun comment(
        id: String,
        username: String? = "alice",
        displayName: String? = "Alice Wonder",
    ) = ApiPostComment(
        id = id,
        content = "hi",
        author = ApiAuthor(id = "u-$id", username = username, displayName = displayName),
    )

    @Test
    fun `empty thread yields an empty directory`() {
        assertThat(CommentMentionDirectory.build(emptyList())).isEmpty()
    }

    @Test
    fun `a comment author with a distinct display name is mapped by handle`() {
        val map = CommentMentionDirectory.build(listOf(comment("c1", "alice", "Alice Wonder")))

        assertThat(map).containsExactly("alice", "Alice Wonder")
    }

    @Test
    fun `a null author contributes nothing`() {
        val orphan = ApiPostComment(id = "c1", content = "hi", author = null)

        assertThat(CommentMentionDirectory.build(listOf(orphan))).isEmpty()
    }

    @Test
    fun `a blank handle is dropped - a mention can never address it`() {
        val map = CommentMentionDirectory.build(listOf(comment("c1", username = "   ", displayName = "Nobody")))

        assertThat(map).isEmpty()
    }

    @Test
    fun `an absent display name is dropped - only the bare handle rule can render it`() {
        val map = CommentMentionDirectory.build(listOf(comment("c1", "bob", displayName = null)))

        assertThat(map).isEmpty()
    }

    @Test
    fun `a blank display name is dropped`() {
        val map = CommentMentionDirectory.build(listOf(comment("c1", "bob", displayName = "  ")))

        assertThat(map).isEmpty()
    }

    @Test
    fun `a vanity display name equal to the handle is dropped - no display-name rule to add`() {
        val map = CommentMentionDirectory.build(listOf(comment("c1", "bob", displayName = "bob")))

        assertThat(map).isEmpty()
    }

    @Test
    fun `the handle and display name are trimmed`() {
        val map = CommentMentionDirectory.build(listOf(comment("c1", "  carol  ", "  Carol Q  ")))

        assertThat(map).containsExactly("carol", "Carol Q")
    }

    @Test
    fun `distinct authors are all mapped`() {
        val map = CommentMentionDirectory.build(
            listOf(
                comment("c1", "alice", "Alice Wonder"),
                comment("c2", "bob", "Bob Le Bricoleur"),
            ),
        )

        assertThat(map).containsExactly("alice", "Alice Wonder", "bob", "Bob Le Bricoleur")
    }

    @Test
    fun `a later display name for the same handle wins`() {
        val map = CommentMentionDirectory.build(
            listOf(
                comment("c1", "alice", "Alice O"),
                comment("c2", "alice", "Alice Renamed"),
            ),
        )

        assertThat(map).containsExactly("alice", "Alice Renamed")
    }
}
