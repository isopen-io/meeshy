package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus
import org.junit.Test

class StoryCommentsReducerTest {

    private fun sent(id: String, createdAt: String?) = StoryComment(
        id = id,
        clientId = null,
        authorName = "Alice",
        avatarUrl = null,
        content = "c-$id",
        isTranslated = false,
        createdAt = createdAt,
        status = StoryCommentStatus.Sent,
    )

    private fun pending(clientId: String) = StoryComment(
        id = clientId,
        clientId = clientId,
        authorName = "Me",
        avatarUrl = null,
        content = "draft-$clientId",
        isTranslated = false,
        createdAt = null,
        status = StoryCommentStatus.Pending,
    )

    // ---- merged ----

    @Test
    fun merged_empty_yieldsEmpty() {
        assertThat(StoryCommentsReducer.merged(emptyList(), emptyList())).isEmpty()
    }

    @Test
    fun merged_sortsServerCommentsOldestFirst() {
        val loaded = listOf(
            sent("b", "2026-06-20T11:00:00Z"),
            sent("a", "2026-06-20T09:00:00Z"),
        )
        val result = StoryCommentsReducer.merged(emptyList(), loaded)

        assertThat(result.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun merged_dedupesServerCommentsById() {
        val loaded = listOf(
            sent("a", "2026-06-20T09:00:00Z"),
            sent("a", "2026-06-20T09:00:00Z"),
        )
        assertThat(StoryCommentsReducer.merged(emptyList(), loaded).map { it.id })
            .containsExactly("a")
    }

    @Test
    fun merged_keepsInFlightOptimisticRowsAtTail() {
        val current = listOf(pending("p1"))
        val loaded = listOf(sent("a", "2026-06-20T09:00:00Z"))

        val result = StoryCommentsReducer.merged(current, loaded)

        assertThat(result.map { it.id }).containsExactly("a", "p1").inOrder()
        assertThat(result.last().status).isEqualTo(StoryCommentStatus.Pending)
    }

    @Test
    fun merged_dropsOptimisticRowOnceServerDeliversIt() {
        // The optimistic id was reconciled to the server id "a" → not kept as a dup.
        val current = listOf(sent("a", "2026-06-20T09:00:00Z"))
        val loaded = listOf(sent("a", "2026-06-20T09:00:00Z"))

        assertThat(StoryCommentsReducer.merged(current, loaded).map { it.id })
            .containsExactly("a")
    }

    @Test
    fun merged_nullCreatedAtServerRows_sinkAfterTimestamped() {
        val loaded = listOf(
            sent("noTime", null),
            sent("a", "2026-06-20T09:00:00Z"),
        )
        assertThat(StoryCommentsReducer.merged(emptyList(), loaded).map { it.id })
            .containsExactly("a", "noTime").inOrder()
    }

    // ---- posting ----

    @Test
    fun posting_appendsOptimisticToTail() {
        val current = listOf(sent("a", "2026-06-20T09:00:00Z"))
        val result = StoryCommentsReducer.posting(current, pending("p1"))

        assertThat(result.map { it.id }).containsExactly("a", "p1").inOrder()
    }

    // ---- confirmed ----

    @Test
    fun confirmed_swapsPendingForServerComment() {
        val current = listOf(pending("p1"))
        val server = sent("s1", "2026-06-20T12:00:00Z")

        val result = StoryCommentsReducer.confirmed(current, "p1", server)

        assertThat(result).hasSize(1)
        assertThat(result.first().id).isEqualTo("s1")
        assertThat(result.first().clientId).isNull()
        assertThat(result.first().status).isEqualTo(StoryCommentStatus.Sent)
    }

    @Test
    fun confirmed_whenEchoAlreadyDelivered_dropsPendingDuplicate() {
        // socket beat the REST ACK: the server row "s1" is already present.
        val current = listOf(sent("s1", "2026-06-20T12:00:00Z"), pending("p1"))
        val server = sent("s1", "2026-06-20T12:00:00Z")

        val result = StoryCommentsReducer.confirmed(current, "p1", server)

        assertThat(result.map { it.id }).containsExactly("s1")
    }

    @Test
    fun confirmed_unknownClientId_appendsWhenIdAbsent() {
        val current = listOf(sent("a", "2026-06-20T09:00:00Z"))
        val server = sent("s1", "2026-06-20T12:00:00Z")

        val result = StoryCommentsReducer.confirmed(current, "ghost", server)

        assertThat(result.map { it.id }).containsExactly("a", "s1").inOrder()
    }

    @Test
    fun confirmed_unknownClientId_isInertWhenIdAlreadyPresent() {
        val current = listOf(sent("s1", "2026-06-20T12:00:00Z"))
        val server = sent("s1", "2026-06-20T12:00:00Z")

        val result = StoryCommentsReducer.confirmed(current, "ghost", server)

        assertThat(result.map { it.id }).containsExactly("s1")
    }

    // ---- failed ----

    @Test
    fun failed_marksPendingRowFailed() {
        val current = listOf(pending("p1"))
        val result = StoryCommentsReducer.failed(current, "p1")

        assertThat(result.first().status).isEqualTo(StoryCommentStatus.Failed)
    }

    @Test
    fun failed_unknownClientId_isInert() {
        val current = listOf(pending("p1"))
        val result = StoryCommentsReducer.failed(current, "other")

        assertThat(result).isEqualTo(current)
    }

    // ---- received ----

    @Test
    fun received_appendsNewComment() {
        val current = listOf(sent("a", "2026-06-20T09:00:00Z"))
        val result = StoryCommentsReducer.received(current, sent("b", "2026-06-20T10:00:00Z"))

        assertThat(result.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun received_isInertWhenIdAlreadyPresent() {
        val current = listOf(sent("a", "2026-06-20T09:00:00Z"))
        val result = StoryCommentsReducer.received(current, sent("a", "2026-06-20T09:00:00Z"))

        assertThat(result).isEqualTo(current)
    }

    @Test
    fun received_intoEmptyList_addsSingle() {
        val result = StoryCommentsReducer.received(emptyList(), sent("a", "2026-06-20T09:00:00Z"))

        assertThat(result.map { it.id }).containsExactly("a")
    }
}
