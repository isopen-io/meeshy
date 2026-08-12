package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [ConversationDraft.isMeaningful] — the shared SSOT for "does this draft carry
 * something worth surfacing/persisting", used by both `DraftAutosave` and the
 * conversation-list draft-aware ordering/preview.
 */
class ConversationDraftTest {

    @Test
    fun `a blank draft with no reply is inert`() {
        assertThat(ConversationDraft(conversationId = "c1", text = "   ").isMeaningful).isFalse()
    }

    @Test
    fun `non-blank text makes a draft meaningful`() {
        assertThat(ConversationDraft(conversationId = "c1", text = "wip").isMeaningful).isTrue()
    }

    @Test
    fun `an armed reply makes an otherwise empty draft meaningful`() {
        assertThat(ConversationDraft(conversationId = "c1", text = "", replyToId = "m1").isMeaningful).isTrue()
    }

    @Test
    fun `a blank reply reference does not make an empty draft meaningful`() {
        assertThat(ConversationDraft(conversationId = "c1", text = "", replyToId = "  ").isMeaningful).isFalse()
    }
}
