package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * [ConversationDraft.isMeaningful] — the shared SSOT for "does this draft carry
 * something worth surfacing in the conversation list" (draft-aware ordering, the
 * "Brouillon" badge, the draft preview line) — and [ConversationDraft.isWorthPersisting]
 * — the broader "does the composer hold unsent state worth keeping across navigation"
 * predicate that `DraftAutosave` uses. The two mirror iOS's split between the
 * text-only `hasDraftText` (list badge) and `isEffectivelyEmpty` (persistence, which
 * also weighs armed effects/blur/ephemeral).
 */
class ConversationDraftTest {

    private val json = Json { ignoreUnknownKeys = true }

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

    // ---- effects never leak into the conversation-list predicate (iOS `hasDraftText` is text-only) ----

    @Test
    fun `armed effects alone do not make a draft meaningful for the list`() {
        val effectsOnly = ConversationDraft(
            conversationId = "c1",
            text = "",
            effects = MessageEffects(flags = MessageEffectFlags.CONFETTI),
        )
        assertThat(effectsOnly.isMeaningful).isFalse()
    }

    // ---- isWorthPersisting: the persistence predicate weighs armed effects ----

    @Test
    fun `armed effects alone make a draft worth persisting`() {
        val effectsOnly = ConversationDraft(
            conversationId = "c1",
            text = "  ",
            effects = MessageEffects(flags = MessageEffectFlags.GLOW),
        )
        assertThat(effectsOnly.isWorthPersisting).isTrue()
    }

    @Test
    fun `a blank draft with no reply and no effects is not worth persisting`() {
        assertThat(ConversationDraft(conversationId = "c1", text = "   ").isWorthPersisting).isFalse()
    }

    @Test
    fun `a draft meaningful for the list is also worth persisting`() {
        assertThat(ConversationDraft(conversationId = "c1", text = "wip").isWorthPersisting).isTrue()
        assertThat(
            ConversationDraft(conversationId = "c1", text = "", replyToId = "m1").isWorthPersisting,
        ).isTrue()
    }

    // ---- back-compat: a legacy blob without the effects field decodes to an empty selection ----

    @Test
    fun `a persisted draft missing the effects field decodes to no effects`() {
        val legacy = """{"conversationId":"c1","text":"hi","replyToId":"m1"}"""

        val decoded = json.decodeFromString<ConversationDraft>(legacy)

        assertThat(decoded.effects).isEqualTo(MessageEffects())
        assertThat(decoded.effects.hasAnyEffect).isFalse()
    }
}
