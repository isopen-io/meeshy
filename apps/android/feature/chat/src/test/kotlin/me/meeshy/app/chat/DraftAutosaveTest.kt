package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ConversationDraft
import org.junit.Test

/**
 * The pure per-conversation draft auto-save/restore decision (feature-parity §C
 * "Draft auto-save/restore"). Behaviour is asserted through [DraftAutosave]'s
 * public API — the persistence decision and the restore text — never through the
 * durable store or the ViewModel.
 */
class DraftAutosaveTest {

    private val now = "2026-07-07T12:00:00Z"

    // ---- resolve() ----

    @Test
    fun non_blank_text_with_no_prior_draft_is_saved_raw() {
        val decision = DraftAutosave.resolve("c1", "hello", now, previous = null)

        assertThat(decision).isEqualTo(
            DraftPersist.Save(ConversationDraft(conversationId = "c1", text = "hello", updatedAt = now)),
        )
    }

    @Test
    fun leading_and_trailing_whitespace_is_preserved_in_the_saved_text() {
        val decision = DraftAutosave.resolve("c1", "  hi there ", now, previous = null)

        assertThat((decision as DraftPersist.Save).draft.text).isEqualTo("  hi there ")
    }

    @Test
    fun text_that_differs_from_the_stored_draft_is_saved() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "hi there", now, previous)

        assertThat(decision).isEqualTo(
            DraftPersist.Save(ConversationDraft(conversationId = "c1", text = "hi there", updatedAt = now)),
        )
    }

    @Test
    fun text_identical_to_the_stored_draft_writes_nothing() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "hi", now, previous)

        assertThat(decision).isEqualTo(DraftPersist.None)
    }

    @Test
    fun blank_text_over_a_stored_draft_clears_it() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "", now, previous)

        assertThat(decision).isEqualTo(DraftPersist.Clear("c1"))
    }

    @Test
    fun whitespace_only_text_over_a_stored_draft_clears_it() {
        val previous = ConversationDraft(conversationId = "c1", text = "hi", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "   \n\t ", now, previous)

        assertThat(decision).isEqualTo(DraftPersist.Clear("c1"))
    }

    @Test
    fun blank_text_with_no_stored_draft_writes_nothing() {
        val decision = DraftAutosave.resolve("c1", "", now, previous = null)

        assertThat(decision).isEqualTo(DraftPersist.None)
    }

    @Test
    fun blank_text_over_a_stored_but_already_blank_draft_writes_nothing() {
        val previous = ConversationDraft(conversationId = "c1", text = "", updatedAt = "old")

        val decision = DraftAutosave.resolve("c1", "", now, previous)

        assertThat(decision).isEqualTo(DraftPersist.None)
    }

    // ---- restore() ----

    @Test
    fun restore_returns_the_stored_text_into_an_idle_empty_composer() {
        val stored = ConversationDraft(conversationId = "c1", text = "unsent", updatedAt = now)

        assertThat(DraftAutosave.restore(stored, currentDraft = "", isEditing = false)).isEqualTo("unsent")
    }

    @Test
    fun restore_ignores_a_null_stored_draft() {
        assertThat(DraftAutosave.restore(stored = null, currentDraft = "", isEditing = false)).isNull()
    }

    @Test
    fun restore_ignores_a_stored_draft_whose_text_is_blank() {
        val stored = ConversationDraft(conversationId = "c1", text = "   ", updatedAt = now)

        assertThat(DraftAutosave.restore(stored, currentDraft = "", isEditing = false)).isNull()
    }

    @Test
    fun restore_never_clobbers_text_the_user_has_already_started_typing() {
        val stored = ConversationDraft(conversationId = "c1", text = "unsent", updatedAt = now)

        assertThat(DraftAutosave.restore(stored, currentDraft = "typing", isEditing = false)).isNull()
    }

    @Test
    fun restore_never_clobbers_an_in_flight_edit() {
        val stored = ConversationDraft(conversationId = "c1", text = "unsent", updatedAt = now)

        assertThat(DraftAutosave.restore(stored, currentDraft = "", isEditing = true)).isNull()
    }
}
