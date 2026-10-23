package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserStatusEvent
import org.junit.Test

/** Une personne qui écrit est TOUJOURS verte (règle produit ; iOS `typingUsername != nil ? .online`). */
class ConversationListTypingPresenceTest {

    private val direct = ApiConversation(
        id = "c1",
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-ali", userId = "ali", displayName = "Ali"),
        ),
    )

    private fun typing(conversationId: String, userId: String) =
        mapOf(conversationId to mapOf(userId to ConversationTyper(userId = userId, displayName = "Ali")))

    @Test
    fun `a peer typing with no presence data at all reads online`() {
        val state = ConversationListUiState(currentUserId = "me", typers = typing("c1", "ali"))

        assertThat(state.presenceStateFor(direct, nowEpochMillis = 0L)).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `a peer typing whose last presence frame said offline reads online`() {
        val state = ConversationListUiState(
            currentUserId = "me",
            typers = typing("c1", "ali"),
            presenceByUserId = mapOf(
                "ali" to UserStatusEvent(userId = "ali", isOnline = false, lastActiveAt = "2020-01-01T00:00:00Z"),
            ),
        )

        assertThat(state.presenceStateFor(direct, nowEpochMillis = 1_800_000_000_000)).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `someone typing in ANOTHER conversation does not light this row`() {
        val state = ConversationListUiState(currentUserId = "me", typers = typing("c2", "ali"))

        assertThat(state.presenceStateFor(direct, nowEpochMillis = 0L)).isNull()
    }
}
