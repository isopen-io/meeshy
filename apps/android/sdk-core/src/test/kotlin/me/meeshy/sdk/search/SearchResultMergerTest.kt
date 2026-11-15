package me.meeshy.sdk.search

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.api.UserSearchResult
import org.junit.Test

class SearchResultMergerTest {

    private fun conversation(id: String, updatedAt: String? = null, title: String? = null) =
        ApiConversation(id = id, updatedAt = updatedAt, title = title)

    private fun hit(id: String, createdAt: String?) =
        MessageSearchHit(ApiMessage(id = id, conversationId = "c", createdAt = createdAt), "t")

    @Test
    fun `a conversation served by both legs appears once with the network copy`() {
        val merged = SearchResultMerger.conversations(
            local = listOf(conversation("a", "2026-01-01T00:00:00Z", title = "local")),
            remote = listOf(conversation("a", "2026-01-01T00:00:00Z", title = "remote")),
        )
        assertThat(merged.map { it.title }).containsExactly("remote")
    }

    @Test
    fun `local conversations fill what the network did not return`() {
        val merged = SearchResultMerger.conversations(
            local = listOf(conversation("b", "2026-01-01T00:00:00Z")),
            remote = listOf(conversation("a", "2026-02-01T00:00:00Z")),
        )
        assertThat(merged.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `conversations are sorted most recent first and equal activity keeps its order`() {
        val merged = SearchResultMerger.conversations(
            local = emptyList(),
            remote = listOf(
                conversation("old", "2026-01-01T00:00:00Z"),
                conversation("tie1", "2026-03-01T00:00:00Z"),
                conversation("tie2", "2026-03-01T00:00:00Z"),
            ),
        )
        assertThat(merged.map { it.id }).containsExactly("tie1", "tie2", "old").inOrder()
    }

    @Test
    fun `users are deduplicated by id and the network copy wins`() {
        val merged = SearchResultMerger.users(
            local = listOf(UserSearchResult(id = "u1", username = "loc"), UserSearchResult(id = "u2")),
            remote = listOf(UserSearchResult(id = "u1", username = "net", isOnline = true)),
        )
        assertThat(merged.map { it.id }).containsExactly("u1", "u2").inOrder()
        assertThat(merged.first().username).isEqualTo("net")
    }

    @Test
    fun `messages are deduplicated by id and sorted newest first`() {
        val merged = SearchResultMerger.messages(
            local = listOf(hit("m1", "2026-01-01T00:00:00Z"), hit("m2", "2026-03-01T00:00:00Z")),
            remote = listOf(hit("m1", "2026-01-01T00:00:00Z"), hit("m3", "2026-02-01T00:00:00Z")),
        )
        assertThat(merged.map { it.message.id }).containsExactly("m2", "m3", "m1").inOrder()
    }
}
