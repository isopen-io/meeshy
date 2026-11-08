package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.preview.ConversationLastReaction
import org.junit.Test

class ConversationListOrderingTest {

    private fun conv(id: String, lastAt: String, rank: String? = null, reaction: ConversationLastReaction? = null) =
        ApiConversation(
            id = id,
            lastMessage = ApiConversationLastMessage(createdAt = lastAt),
            listRankAt = rank,
            lastReaction = reaction,
        )

    private fun ids(l: List<ApiConversation>) = l.map { it.id }

    @Test
    fun `le rang servi remonte une ligne au dessus d un message plus recent`() {
        val out = DraftAwareOrdering.apply(
            listOf(conv("a", "2026-03-02T00:00:00Z"), conv("b", "2026-03-01T00:00:00Z", rank = "2026-03-05T00:00:00Z")),
            emptyMap(),
        )
        assertThat(ids(out)).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `une reaction a un message du lecteur remonte la ligne`() {
        val reaction = ConversationLastReaction(
            emoji = "x", reactorId = "r", reactorName = "R", messageId = "m",
            targetSenderUserId = "me", createdAt = "2026-03-09T00:00:00Z",
        )
        val input = listOf(conv("a", "2026-03-02T00:00:00Z"), conv("b", "2026-03-01T00:00:00Z", reaction = reaction))
        assertThat(ids(DraftAwareOrdering.apply(input, emptyMap(), readerId = "me"))).containsExactly("b", "a").inOrder()
        assertThat(ids(DraftAwareOrdering.apply(input, emptyMap(), readerId = "other"))).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `un brouillon flotte au dessus du rang`() {
        val input = listOf(conv("a", "2026-03-02T00:00:00Z"), conv("b", "2026-03-01T00:00:00Z"))
        val drafts = mapOf("b" to ConversationDraft(conversationId = "b", text = "wip"))
        assertThat(ids(DraftAwareOrdering.apply(input, drafts))).containsExactly("b", "a").inOrder()
    }
}
