package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

/**
 * State-level derivation: [ConversationListUiState.moodEmojiFor] must feed the pure
 * [ConversationMoodStatus] resolver with the state's live
 * [ConversationListUiState.moodStatuses] and its [ConversationListUiState.currentUserId],
 * so the row avatar shows the peer's mood emoji without the composable knowing
 * anything about the status feed.
 */
class ConversationListMoodStateTest {

    private fun directWithPeer(peerId: String): ApiConversation =
        ApiConversation(
            id = "c1",
            type = "direct",
            participants = listOf(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p-peer", userId = peerId, displayName = "Peer"),
            ),
        )

    private fun status(userId: String, moodEmoji: String): StatusEntry =
        StatusEntry(id = "st-$userId", userId = userId, moodEmoji = moodEmoji)

    @Test
    fun `state resolves the peer's mood emoji from its status set`() {
        val state = ConversationListUiState(
            currentUserId = "me",
            moodStatuses = listOf(status("peer", "🎈")),
        )
        assertThat(state.moodEmojiFor(directWithPeer("peer"))).isEqualTo("🎈")
    }

    @Test
    fun `state yields no mood when the status set is empty`() {
        val state = ConversationListUiState(
            currentUserId = "me",
            moodStatuses = emptyList(),
        )
        assertThat(state.moodEmojiFor(directWithPeer("peer"))).isNull()
    }

    @Test
    fun `state passes its own currentUserId so the peer is resolved from the right side`() {
        // currentUserId = "peer" makes "me" the OTHER participant; only "me" has a status.
        val state = ConversationListUiState(
            currentUserId = "peer",
            moodStatuses = listOf(status("me", "🌟")),
        )
        assertThat(state.moodEmojiFor(directWithPeer("peer"))).isEqualTo("🌟")
    }
}
