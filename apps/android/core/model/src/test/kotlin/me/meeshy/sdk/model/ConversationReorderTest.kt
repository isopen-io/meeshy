package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationReorderTest {

    private val ids = listOf("a", "b", "c", "d")

    @Test
    fun `dragging a row down renumbers the span it crossed`() {
        assertThat(ConversationReorder.move(ids, from = 0, to = 2)).containsExactly(
            ConversationReorderItem("b", 0),
            ConversationReorderItem("c", 1),
            ConversationReorderItem("a", 2),
        ).inOrder()
    }

    @Test
    fun `dragging a row up renumbers the span it crossed`() {
        assertThat(ConversationReorder.move(ids, from = 3, to = 1)).containsExactly(
            ConversationReorderItem("d", 1),
            ConversationReorderItem("b", 2),
            ConversationReorderItem("c", 3),
        ).inOrder()
    }

    @Test
    fun `dropping a row where it started or out of range sends nothing`() {
        assertThat(ConversationReorder.move(ids, 1, 1)).isEmpty()
        assertThat(ConversationReorder.move(ids, -1, 2)).isEmpty()
        assertThat(ConversationReorder.move(ids, 0, 4)).isEmpty()
        assertThat(ConversationReorder.move(emptyList(), 0, 0)).isEmpty()
    }

    @Test
    fun `coalesce keeps the latest order per conversation`() {
        val merged = ConversationReorder.coalesce(
            older = listOf(ConversationReorderItem("a", 0), ConversationReorderItem("b", 1)),
            newer = listOf(ConversationReorderItem("b", 0), ConversationReorderItem("a", 1)),
        )

        assertThat(merged).containsExactly(
            ConversationReorderItem("a", 1),
            ConversationReorderItem("b", 0),
        )
    }

    @Test
    fun `the wire body is updates with conversationId and orderInCategory`() {
        val json = kotlinx.serialization.json.Json.encodeToString(
            ConversationReorderBody.serializer(),
            ConversationReorderBody(listOf(ConversationReorderItem("a", 2))),
        )

        assertThat(json).isEqualTo("""{"updates":[{"conversationId":"a","orderInCategory":2}]}""")
    }
}
