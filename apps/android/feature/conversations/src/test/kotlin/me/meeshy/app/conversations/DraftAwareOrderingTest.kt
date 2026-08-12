package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationDraft
import org.junit.Test

/**
 * Draft-aware ordering (parity §B "drafts float to top"). Behaviour asserted
 * through [DraftAwareOrdering.apply] on real [ApiConversation]/[ConversationDraft].
 */
class DraftAwareOrderingTest {

    private fun conv(id: String) = ApiConversation(id = id)

    private fun draft(id: String, text: String = "wip", updatedAt: String? = null, replyToId: String? = null) =
        ConversationDraft(conversationId = id, text = text, updatedAt = updatedAt, replyToId = replyToId)

    private fun ids(list: List<ApiConversation>) = list.map { it.id }

    @Test
    fun `an empty list stays empty`() {
        assertThat(DraftAwareOrdering.apply(emptyList(), mapOf("a" to draft("a")))).isEmpty()
    }

    @Test
    fun `no drafts leaves the incoming order untouched`() {
        val input = listOf(conv("a"), conv("b"), conv("c"))

        assertThat(ids(DraftAwareOrdering.apply(input, emptyMap()))).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `a single draft-bearing conversation floats to the top`() {
        val input = listOf(conv("a"), conv("b"), conv("c"))

        val out = DraftAwareOrdering.apply(input, mapOf("c" to draft("c")))

        assertThat(ids(out)).containsExactly("c", "a", "b").inOrder()
    }

    @Test
    fun `non-draft rows keep their relative order below the floated group`() {
        val input = listOf(conv("a"), conv("b"), conv("c"), conv("d"))

        val out = DraftAwareOrdering.apply(input, mapOf("b" to draft("b")))

        assertThat(ids(out)).containsExactly("b", "a", "c", "d").inOrder()
    }

    @Test
    fun `floated rows are ordered by draft updatedAt descending`() {
        val input = listOf(conv("a"), conv("b"), conv("c"))
        val drafts = mapOf(
            "a" to draft("a", updatedAt = "2026-07-01T00:00:00Z"),
            "c" to draft("c", updatedAt = "2026-07-05T00:00:00Z"),
        )

        val out = DraftAwareOrdering.apply(input, drafts)

        // c (newer draft) floats above a (older draft); b (no draft) stays last.
        assertThat(ids(out)).containsExactly("c", "a", "b").inOrder()
    }

    @Test
    fun `a draft without a timestamp sorts last among the floated group but still above non-drafts`() {
        val input = listOf(conv("a"), conv("b"), conv("c"))
        val drafts = mapOf(
            "a" to draft("a", updatedAt = null),
            "b" to draft("b", updatedAt = "2026-07-05T00:00:00Z"),
        )

        val out = DraftAwareOrdering.apply(input, drafts)

        assertThat(ids(out)).containsExactly("b", "a", "c").inOrder()
    }

    @Test
    fun `a whole-second timestamp does not outrank a later sub-second one in the same second`() {
        // Regression: Instant.toString() (the real source of updatedAt, via
        // Instant.ofEpochMilli(...).toString()) omits the fractional-second suffix when it's
        // exactly zero, producing a BARE string like "...T12:34:56Z" for that draft while a
        // later save within the same second produces "...T12:34:56.500Z". Naive lexicographic
        // string comparison ranks the bare string higher ('.' < 'Z'), inverting the intended
        // most-recent-first order. This must sort by actual instant, not by string bytes.
        val input = listOf(conv("a"), conv("b"))
        val drafts = mapOf(
            "a" to draft("a", updatedAt = "2026-07-05T12:34:56Z"),
            "b" to draft("b", updatedAt = "2026-07-05T12:34:56.500Z"),
        )

        val out = DraftAwareOrdering.apply(input, drafts)

        // b (12:34:56.500, chronologically later) must float above a (12:34:56.000).
        assertThat(ids(out)).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `an unparseable timestamp sorts last among the floated group, like a missing one`() {
        val input = listOf(conv("a"), conv("b"), conv("c"))
        val drafts = mapOf(
            "a" to draft("a", updatedAt = "not-a-timestamp"),
            "b" to draft("b", updatedAt = "2026-07-05T00:00:00Z"),
        )

        val out = DraftAwareOrdering.apply(input, drafts)

        assertThat(ids(out)).containsExactly("b", "a", "c").inOrder()
    }

    @Test
    fun `equal timestamps keep the incoming relative order (stable sort)`() {
        val input = listOf(conv("a"), conv("b"), conv("c"))
        val ts = "2026-07-05T00:00:00Z"
        val drafts = mapOf("a" to draft("a", updatedAt = ts), "b" to draft("b", updatedAt = ts))

        val out = DraftAwareOrdering.apply(input, drafts)

        assertThat(ids(out)).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `an inert draft (blank text, no reply) does not float`() {
        val input = listOf(conv("a"), conv("b"))

        val out = DraftAwareOrdering.apply(input, mapOf("b" to draft("b", text = "  ", replyToId = null)))

        assertThat(ids(out)).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `a reply-only draft (blank text, armed reply) still floats`() {
        val input = listOf(conv("a"), conv("b"))

        val out = DraftAwareOrdering.apply(input, mapOf("b" to draft("b", text = "", replyToId = "m1")))

        assertThat(ids(out)).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `a draft for a conversation absent from the list is ignored`() {
        val input = listOf(conv("a"), conv("b"))

        val out = DraftAwareOrdering.apply(input, mapOf("ghost" to draft("ghost")))

        assertThat(ids(out)).containsExactly("a", "b").inOrder()
    }
}
