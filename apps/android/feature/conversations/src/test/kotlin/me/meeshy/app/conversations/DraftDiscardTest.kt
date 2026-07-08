package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ConversationDraft
import org.junit.Test

/**
 * The pure discard rule (parity §B draft lifecycle). Behaviour asserted through
 * [DraftDiscard]'s public API on real [ConversationDraft]s — no implementation
 * details, no tautologies.
 */
class DraftDiscardTest {

    private fun draft(id: String, text: String = "wip", replyToId: String? = null) =
        ConversationDraft(conversationId = id, text = text, replyToId = replyToId)

    @Test
    fun `a meaningful text draft is discardable`() {
        assertThat(DraftDiscard.isDiscardable("a", mapOf("a" to draft("a", text = "hello")))).isTrue()
    }

    @Test
    fun `a reply-only armed draft is discardable`() {
        val armed = draft("a", text = "", replyToId = "m1")
        assertThat(DraftDiscard.isDiscardable("a", mapOf("a" to armed))).isTrue()
    }

    @Test
    fun `an absent draft is not discardable`() {
        assertThat(DraftDiscard.isDiscardable("a", emptyMap())).isFalse()
    }

    @Test
    fun `a blank non-reply draft is not discardable`() {
        val inert = draft("a", text = "   ", replyToId = null)
        assertThat(DraftDiscard.isDiscardable("a", mapOf("a" to inert))).isFalse()
    }

    @Test
    fun `discarding a present draft removes only that entry`() {
        val drafts = mapOf("a" to draft("a"), "b" to draft("b"))

        val after = DraftDiscard.afterDiscard("a", drafts)

        assertThat(after.keys).containsExactly("b")
        assertThat(after.getValue("b").conversationId).isEqualTo("b")
    }

    @Test
    fun `discarding an absent draft returns the same instance unchanged`() {
        val drafts = mapOf("a" to draft("a"))

        assertThat(DraftDiscard.afterDiscard("missing", drafts)).isSameInstanceAs(drafts)
    }

    @Test
    fun `discarding removes even a persisted non-meaningful entry`() {
        val drafts = mapOf("a" to draft("a", text = "  ", replyToId = null))

        assertThat(DraftDiscard.afterDiscard("a", drafts)).isEmpty()
    }

    @Test
    fun `discarding the last draft yields an empty map`() {
        assertThat(DraftDiscard.afterDiscard("a", mapOf("a" to draft("a")))).isEmpty()
    }
}
