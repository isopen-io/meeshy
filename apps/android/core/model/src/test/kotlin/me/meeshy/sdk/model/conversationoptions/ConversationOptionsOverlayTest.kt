package me.meeshy.sdk.model.conversationoptions

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationPreferences
import org.junit.Test

/**
 * L'affichage optimiste des Options (#13777, iOS `ConversationOptionsViewModel.applyMutation`) :
 * le geste se voit dans l'image du toucher, il tombe quand la ligne en cache le porte, et il
 * se défait quand l'écriture échoue.
 */
class ConversationOptionsOverlayTest {

    private val stored = ConversationOptionsValues.of(ApiConversationPreferences())

    @Test
    fun `values read blank custom name and reaction as absent`() {
        val values = ConversationOptionsValues.of(ApiConversationPreferences(customName = " ", reaction = ""))

        assertThat(values.customName).isNull()
        assertThat(values.reaction).isNull()
        assertThat(ConversationOptionsValues.of(null)).isEqualTo(stored)
    }

    @Test
    fun `mentions only can only be changed while the conversation is not muted`() {
        assertThat(stored.mentionsOnlyEnabled).isTrue()
        assertThat(stored.copy(isMuted = true).mentionsOnlyEnabled).isFalse()
    }

    @Test
    fun `a pending edit shows at once over the stored values`() {
        val overlay = ConversationOptionsOverlay().pending(ConversationOptionsEdit.Pinned(true))

        assertThat(overlay.displayed(stored).isPinned).isTrue()
    }

    @Test
    fun `edits stack in the order of the gestures`() {
        val overlay = ConversationOptionsOverlay()
            .pending(ConversationOptionsEdit.Muted(true))
            .pending(ConversationOptionsEdit.Tags(listOf("work")))
            .pending(ConversationOptionsEdit.Muted(false))

        val shown = overlay.displayed(stored)

        assertThat(shown.isMuted).isFalse()
        assertThat(shown.tags).containsExactly("work")
    }

    @Test
    fun `a later gesture on the same setting replaces the earlier one, so the cache cannot absorb the wrong one`() {
        val overlay = ConversationOptionsOverlay()
            .pending(ConversationOptionsEdit.Muted(true))
            .pending(ConversationOptionsEdit.Muted(false))

        assertThat(overlay.absorb(stored).isEmpty).isTrue()
        assertThat(overlay.settle(ConversationOptionsEdit.Muted(true)).isEmpty).isFalse()
    }

    @Test
    fun `an edit the cache now carries is absorbed`() {
        val overlay = ConversationOptionsOverlay().pending(ConversationOptionsEdit.Archived(true))

        val next = overlay.absorb(stored.copy(isArchived = true))

        assertThat(next.isEmpty).isTrue()
    }

    @Test
    fun `an edit the cache does not carry yet stays pending`() {
        val overlay = ConversationOptionsOverlay().pending(ConversationOptionsEdit.Reaction("🔥"))

        assertThat(overlay.absorb(stored).isEmpty).isFalse()
    }

    @Test
    fun `a failed write rolls its edit back and keeps the others`() {
        val failed = ConversationOptionsEdit.Pinned(true)
        val overlay = ConversationOptionsOverlay()
            .pending(failed)
            .pending(ConversationOptionsEdit.MentionsOnly(true))

        val next = overlay.settle(failed)

        assertThat(next.displayed(stored).isPinned).isFalse()
        assertThat(next.displayed(stored).mentionsOnly).isTrue()
    }

    @Test
    fun `the category edit shows the chosen category`() {
        val overlay = ConversationOptionsOverlay().pending(ConversationOptionsEdit.Category("cat-1"))

        assertThat(overlay.displayed(stored).categoryId).isEqualTo("cat-1")
        assertThat(overlay.absorb(stored.copy(categoryId = "cat-1")).isEmpty).isTrue()
    }

    @Test
    fun `removing the category shows the conversation uncategorized until the cache agrees`() {
        val categorized = stored.copy(categoryId = "cat-1")
        val overlay = ConversationOptionsOverlay().pending(ConversationOptionsEdit.Category(null))

        assertThat(overlay.displayed(categorized).categoryId).isNull()
        assertThat(overlay.absorb(categorized).isEmpty).isFalse()
        assertThat(overlay.absorb(categorized.copy(categoryId = null)).isEmpty).isTrue()
    }

    @Test
    fun `the archive confirmation names the gesture the tap will make`() {
        assertThat(stored.archiveGesture).isEqualTo(ArchiveGesture.ARCHIVE)
        assertThat(stored.copy(isArchived = true).archiveGesture).isEqualTo(ArchiveGesture.UNARCHIVE)
    }
}
