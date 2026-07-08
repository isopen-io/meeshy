package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ConversationDraft
import org.junit.Test

/**
 * The pure per-conversation draft auto-save/restore decision (feature-parity §C
 * "Draft auto-save/restore" + the reply-reference persistence of iOS's app-side
 * `DraftStore`). Behaviour is asserted through [DraftAutosave]'s public API — the
 * persistence decision and the restore snapshot — never through the durable store
 * or the ViewModel.
 */
class DraftAutosaveTest {

    private val now = "2026-07-07T12:00:00Z"

    // ---- resolve(): text-only behaviour ----

    @Test
    fun non_blank_text_with_no_prior_draft_is_saved_raw() {
        val decision = DraftAutosave.resolve("c1", "hello", replyToId = null, now, previous = null)

        assertThat(decision).isEqualTo(
            DraftPersist.Save(ConversationDraft(conversationId = "c1", text = "hello", updatedAt = now)),
        )
    }

    @Test
    fun leading_and_trailing_whitespace_is_preserved_in_the_saved_text() {
        val decision = DraftAutosave.resolve("c1", "  hi there ", replyToId = null, now, previous = null)

        assertThat((decision as DraftPersist.Save).draft.text).isEqualTo("  hi there ")
    }

    @Test
    fun text_that_differs_from_the_stored_draft_is_saved() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "hi there", replyToId = null, now, previous)

        assertThat(decision).isEqualTo(
            DraftPersist.Save(ConversationDraft(conversationId = "c1", text = "hi there", updatedAt = now)),
        )
    }

    @Test
    fun text_identical_to_the_stored_draft_writes_nothing() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "hi", replyToId = null, now, previous)

        assertThat(decision).isEqualTo(DraftPersist.None)
    }

    @Test
    fun blank_text_over_a_stored_draft_clears_it() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "", replyToId = null, now, previous)

        assertThat(decision).isEqualTo(DraftPersist.Clear("c1"))
    }

    @Test
    fun whitespace_only_text_over_a_stored_draft_clears_it() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "   \n\t ", replyToId = null, now, previous)

        assertThat(decision).isEqualTo(DraftPersist.Clear("c1"))
    }

    @Test
    fun blank_text_with_no_stored_draft_writes_nothing() {
        val decision = DraftAutosave.resolve("c1", "", replyToId = null, now, previous = null)

        assertThat(decision).isEqualTo(DraftPersist.None)
    }

    @Test
    fun blank_text_over_a_stored_but_already_blank_draft_writes_nothing() {
        val previous = ConversationDraft(conversationId = "c1", text = "", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "", replyToId = null, now, previous)

        assertThat(decision).isEqualTo(DraftPersist.None)
    }

    // ---- resolve(): reply-reference behaviour ----

    @Test
    fun an_armed_reply_on_an_empty_composer_is_persisted() {
        val decision = DraftAutosave.resolve("c1", "", replyToId = "m1", now, previous = null)

        assertThat(decision).isEqualTo(
            DraftPersist.Save(
                ConversationDraft(conversationId = "c1", text = "", updatedAt = now, replyToId = "m1"),
            ),
        )
    }

    @Test
    fun text_typed_under_an_armed_reply_carries_the_reply_reference() {
        val decision = DraftAutosave.resolve("c1", "re: salut", replyToId = "m1", now, previous = null)

        assertThat(decision).isEqualTo(
            DraftPersist.Save(
                ConversationDraft(conversationId = "c1", text = "re: salut", updatedAt = now, replyToId = "m1"),
            ),
        )
    }

    @Test
    fun the_reply_reference_is_trimmed_and_a_blank_reference_is_dropped() {
        val trimmed = DraftAutosave.resolve("c1", "hi", replyToId = "  m1 ", now, previous = null)
        assertThat((trimmed as DraftPersist.Save).draft.replyToId).isEqualTo("m1")

        val blank = DraftAutosave.resolve("c1", "hi", replyToId = "   ", now, previous = null)
        assertThat((blank as DraftPersist.Save).draft.replyToId).isNull()
    }

    @Test
    fun only_the_reply_reference_changing_still_saves() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old", replyToId = "m1")

        val decision = DraftAutosave.resolve("c1", "hi", replyToId = "m2", now, previous)

        assertThat(decision).isEqualTo(
            DraftPersist.Save(
                ConversationDraft(conversationId = "c1", text = "hi", updatedAt = now, replyToId = "m2"),
            ),
        )
    }

    @Test
    fun identical_text_and_reply_writes_nothing() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old", replyToId = "m1")

        val decision = DraftAutosave.resolve("c1", "hi", replyToId = "m1", now, previous)

        assertThat(decision).isEqualTo(DraftPersist.None)
    }

    @Test
    fun cancelling_the_reply_on_an_empty_composer_clears_a_reply_only_draft() {
        val previous = ConversationDraft(conversationId = "c1", text = "", updatedAt = "old", replyToId = "m1")

        val decision = DraftAutosave.resolve("c1", "", replyToId = null, now, previous)

        assertThat(decision).isEqualTo(DraftPersist.Clear("c1"))
    }

    @Test
    fun dropping_the_reply_while_text_remains_saves_the_text_without_a_reference() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old", replyToId = "m1")

        val decision = DraftAutosave.resolve("c1", "hi", replyToId = null, now, previous)

        assertThat(decision).isEqualTo(
            DraftPersist.Save(ConversationDraft(conversationId = "c1", text = "hi", updatedAt = now, replyToId = null)),
        )
    }

    // ---- restore() ----

    @Test
    fun restore_returns_the_stored_text_into_an_idle_empty_composer() {
        val stored = ConversationDraft(conversationId = "c1", text = "unsent", updatedAt = now)

        assertThat(DraftAutosave.restore(stored, currentDraft = "", isEditing = false))
            .isEqualTo(DraftRestore(text = "unsent", replyToId = null))
    }

    @Test
    fun restore_re_arms_a_reply_only_draft_with_empty_text() {
        val stored = ConversationDraft(conversationId = "c1", text = "", updatedAt = now, replyToId = "m1")

        assertThat(DraftAutosave.restore(stored, currentDraft = "", isEditing = false))
            .isEqualTo(DraftRestore(text = "", replyToId = "m1"))
    }

    @Test
    fun restore_returns_both_text_and_reply_for_a_half_typed_reply() {
        val stored = ConversationDraft(conversationId = "c1", text = "re: salut", updatedAt = now, replyToId = "m1")

        assertThat(DraftAutosave.restore(stored, currentDraft = "", isEditing = false))
            .isEqualTo(DraftRestore(text = "re: salut", replyToId = "m1"))
    }

    @Test
    fun restore_trims_a_padded_reply_reference_and_drops_a_blank_one() {
        val padded = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = now, replyToId = "  m1 ")
        assertThat(DraftAutosave.restore(padded, currentDraft = "", isEditing = false)?.replyToId).isEqualTo("m1")

        val blankRef = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = now, replyToId = "   ")
        assertThat(DraftAutosave.restore(blankRef, currentDraft = "", isEditing = false)?.replyToId).isNull()
    }

    @Test
    fun restore_ignores_a_null_stored_draft() {
        assertThat(DraftAutosave.restore(stored = null, currentDraft = "", isEditing = false)).isNull()
    }

    @Test
    fun restore_ignores_a_stored_draft_with_neither_text_nor_reply() {
        val stored = ConversationDraft(conversationId = "c1", text = "   ", updatedAt = now, replyToId = null)

        assertThat(DraftAutosave.restore(stored, currentDraft = "", isEditing = false)).isNull()
    }

    @Test
    fun restore_never_clobbers_text_the_user_has_already_started_typing() {
        val stored = ConversationDraft(conversationId = "c1", text = "unsent", updatedAt = now, replyToId = "m1")

        assertThat(DraftAutosave.restore(stored, currentDraft = "typing", isEditing = false)).isNull()
    }

    @Test
    fun restore_never_clobbers_an_in_flight_edit() {
        val stored = ConversationDraft(conversationId = "c1", text = "unsent", updatedAt = now)

        assertThat(DraftAutosave.restore(stored, currentDraft = "", isEditing = true)).isNull()
    }
}
