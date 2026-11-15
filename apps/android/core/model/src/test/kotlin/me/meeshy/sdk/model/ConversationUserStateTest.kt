package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationUserStateTest {

    private fun conversation(prefs: ApiConversationPreferences? = null) = ApiConversation(
        id = "c1",
        unreadCount = 3,
        lastReadMessageId = "m9",
        lastReadAt = "2026-01-02T00:00:00Z",
        lastReadMessageCreatedAt = "2026-01-01T00:00:00Z",
        userPreferences = listOfNotNull(prefs),
    )

    @Test
    fun `projection carries served preferences and read cursor`() {
        val state = conversation(
            ApiConversationPreferences(
                isPinned = true, isMuted = true, categoryId = "cat", orderInCategory = 2,
                clearHistoryBefore = "2026-01-01T00:00:00Z", version = 5,
            ),
        ).toUserState()
        assertThat(state.isPinned).isTrue()
        assertThat(state.sectionId).isEqualTo("cat")
        assertThat(state.orderInCategory).isEqualTo(2)
        assertThat(state.clearHistoryBefore).isEqualTo("2026-01-01T00:00:00Z")
        assertThat(state.version).isEqualTo(5)
        assertThat(state.unreadCount).isEqualTo(3)
        assertThat(state.lastReadMessageId).isEqualTo("m9")
        assertThat(state.lastReadMessageCreatedAt).isEqualTo("2026-01-01T00:00:00Z")
    }

    @Test
    fun `local flags and sync metadata come from the arguments`() {
        val state = conversation().toUserState(isLocked = true, pendingMutationCount = 2, lastSyncedAt = "t")
        assertThat(state.isLocked).isTrue()
        assertThat(state.hasPendingSync).isTrue()
        assertThat(state.lastSyncedAt).isEqualTo("t")
    }

    @Test
    fun `a meaningful draft sets hasDraft and a trimmed preview`() {
        val state = conversation().toUserState(draft = ConversationDraft("c1", text = "  salut  "))
        assertThat(state.hasDraft).isTrue()
        assertThat(state.draftPreview).isEqualTo("salut")
    }

    @Test
    fun `a blank draft is not surfaced`() {
        val state = conversation().toUserState(draft = ConversationDraft("c1", text = "  "))
        assertThat(state.hasDraft).isFalse()
        assertThat(state.draftPreview).isNull()
    }

    @Test
    fun `grafting keeps incoming read half and local preferences half`() {
        val local = ConversationUserState(isPinned = true, isLocked = true, version = 7, unreadCount = 0)
        val incoming = ConversationUserState(unreadCount = 5, lastReadMessageId = "m", version = 3)
        val merged = local.preferencesGrafted(incoming)
        assertThat(merged.unreadCount).isEqualTo(5)
        assertThat(merged.lastReadMessageId).isEqualTo("m")
        assertThat(merged.isPinned).isTrue()
        assertThat(merged.isLocked).isTrue()
        assertThat(merged.version).isEqualTo(7)
    }

    @Test
    fun `an archived or deleted row is not visible`() {
        assertThat(ConversationUserState(isArchived = true).isVisible).isFalse()
        assertThat(ConversationUserState(deletedForUserAt = "t").isVisible).isFalse()
        assertThat(ConversationUserState().isVisible).isTrue()
    }
}
