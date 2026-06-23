package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryViewer
import org.junit.Test

class StoryViewersPresentationTest {

    private fun viewer(id: String, viewedAt: String?) =
        StoryViewer(
            id = id,
            username = id,
            displayName = id,
            avatarUrl = null,
            viewedAt = viewedAt,
            reactionEmoji = null,
        )

    @Test
    fun order_sortsMostRecentFirst() {
        val ordered = StoryViewersPresentation.order(
            listOf(
                viewer("a", "2026-06-17T09:00:00Z"),
                viewer("b", "2026-06-17T11:00:00Z"),
                viewer("c", "2026-06-17T10:00:00Z"),
            ),
        )

        assertThat(ordered.map { it.id }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun order_sinksNullTimestampsToBottom() {
        val ordered = StoryViewersPresentation.order(
            listOf(
                viewer("a", null),
                viewer("b", "2026-06-17T11:00:00Z"),
                viewer("c", null),
            ),
        )

        assertThat(ordered.first().id).isEqualTo("b")
        assertThat(ordered.map { it.id }.drop(1)).containsExactly("a", "c")
    }

    @Test
    fun order_preservesInputOrderForNullTimestampTies() {
        val ordered = StoryViewersPresentation.order(
            listOf(viewer("a", null), viewer("b", null)),
        )

        assertThat(ordered.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun order_dedupsById_keepingMostRecentRow() {
        val ordered = StoryViewersPresentation.order(
            listOf(
                viewer("dup", "2026-06-17T08:00:00Z"),
                viewer("dup", "2026-06-17T12:00:00Z"),
            ),
        )

        assertThat(ordered).hasSize(1)
        assertThat(ordered.single().viewedAt).isEqualTo("2026-06-17T12:00:00Z")
    }

    @Test
    fun order_emptyInputIsEmpty() {
        assertThat(StoryViewersPresentation.order(emptyList())).isEmpty()
    }

    @Test
    fun order_singleElementIsUnchanged() {
        val one = listOf(viewer("only", "2026-06-17T09:00:00Z"))

        assertThat(StoryViewersPresentation.order(one)).isEqualTo(one)
    }
}
