package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.component.StoryRingState
import org.junit.Test

/**
 * State-level derivation: [ConversationListUiState.storyRingFor] must feed the pure
 * [ConversationStoryRing] resolver with the state's live [ConversationListUiState.storyGroups]
 * and its [ConversationListUiState.currentUserId], so the row avatar reflects the peer's
 * story ring without the composable knowing anything about story data.
 */
class ConversationListStoryRingStateTest {

    private val now = 1_700_000_000_000L
    private val future = "2099-01-01T00:00:00Z"

    private fun directWithPeer(peerId: String): ApiConversation =
        ApiConversation(
            id = "c1",
            type = "direct",
            participants = listOf(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p-peer", userId = peerId, displayName = "Peer"),
            ),
        )

    @Test
    fun `state resolves the peer's unread ring from its story groups`() {
        val state = ConversationListUiState(
            currentUserId = "me",
            storyGroups = listOf(
                StoryGroup(id = "peer", stories = listOf(StoryItem(id = "s1", expiresAt = future, isViewed = false))),
            ),
        )
        assertThat(state.storyRingFor(directWithPeer("peer"), now)).isEqualTo(StoryRingState.Unread)
    }

    @Test
    fun `state yields no ring when no story group matches the peer`() {
        val state = ConversationListUiState(
            currentUserId = "me",
            storyGroups = emptyList(),
        )
        assertThat(state.storyRingFor(directWithPeer("peer"), now)).isEqualTo(StoryRingState.None)
    }

    @Test
    fun `state passes its own currentUserId so the peer is resolved from the right side`() {
        // currentUserId = "peer" makes "me" the OTHER participant; only "me" has a story group.
        val state = ConversationListUiState(
            currentUserId = "peer",
            storyGroups = listOf(
                StoryGroup(id = "me", stories = listOf(StoryItem(id = "s1", expiresAt = future, isViewed = true))),
            ),
        )
        assertThat(state.storyRingFor(directWithPeer("peer"), now)).isEqualTo(StoryRingState.Read)
    }
}
