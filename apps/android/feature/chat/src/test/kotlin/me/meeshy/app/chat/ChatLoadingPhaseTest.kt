package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ConversationLoadingPhase
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

class ChatLoadingPhaseTest {

    @Test
    fun `a cold open with the skeleton is the only blocking phase`() {
        val phase = ChatUiState(showSkeleton = true, isSyncing = true).loadingPhase()

        assertThat(phase).isEqualTo(ConversationLoadingPhase.LOADING_INITIAL)
        assertThat(phase.isBlockingSpinnerNeeded).isTrue()
    }

    @Test
    fun `paginating up keeps the list visible and is not blocking`() {
        val phase = ChatUiState(isLoadingOlder = true).loadingPhase()

        assertThat(phase).isEqualTo(ConversationLoadingPhase.LOADING_OLDER)
        assertThat(phase.isBlockingSpinnerNeeded).isFalse()
    }

    @Test
    fun `paginating down comes from the landing controller`() {
        val phase = ChatUiState().loadingPhase(isLoadingNewer = true)

        assertThat(phase).isEqualTo(ConversationLoadingPhase.LOADING_NEWER)
    }

    @Test
    fun `a sync over a painted list is a discreet revalidation`() {
        val phase = ChatUiState(messages = listOf(bubble()), isSyncing = true).loadingPhase()

        assertThat(phase).isEqualTo(ConversationLoadingPhase.REVALIDATING)
        assertThat(phase.isBlockingSpinnerNeeded).isFalse()
    }

    @Test
    fun `an empty idle conversation is idle and a settled one is loaded`() {
        assertThat(ChatUiState().loadingPhase()).isEqualTo(ConversationLoadingPhase.IDLE)
        assertThat(ChatUiState(messages = listOf(bubble())).loadingPhase()).isEqualTo(ConversationLoadingPhase.LOADED)
    }

    private fun bubble() = BubbleContent(
        messageId = "m1",
        text = "m",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
    )
}
