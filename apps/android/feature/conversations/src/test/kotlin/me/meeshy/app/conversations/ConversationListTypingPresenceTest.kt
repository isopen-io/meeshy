package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.presence.PresenceMapReducer
import org.junit.Test
import java.time.Instant

/**
 * La ligne de liste lit la carte de présence unique : une frappe DATE l'activité (la carte porte
 * `lastActiveAt = maintenant`), elle ne force plus `isOnline` — le point est vert 60 s puis décroît.
 */
class ConversationListTypingPresenceTest {

    private val now = 1_800_000_000_000L

    private val direct = ApiConversation(
        id = "c1",
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-ali", userId = "ali", displayName = "Ali"),
        ),
    )

    private fun stateWith(vararg entries: Pair<String, UserPresence>) =
        ConversationListUiState(currentUserId = "me", presenceByUserId = mapOf(*entries))

    @Test
    fun `a peer who just typed reads online even though the server said offline`() {
        val map = PresenceMapReducer.noteActivity(
            mapOf("ali" to UserPresence(false, Instant.ofEpochMilli(now - 3_600_000).toString())), "ali", "me", now,
        )
        val state = ConversationListUiState(currentUserId = "me", presenceByUserId = map)

        assertThat(state.presenceStateFor(direct, now + 1_000)).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `a typer decays to away after 60 seconds instead of staying green`() {
        val map = PresenceMapReducer.noteActivity(emptyMap(), "ali", "me", now)
        val state = ConversationListUiState(currentUserId = "me", presenceByUserId = map)

        assertThat(state.presenceStateFor(direct, now + 61_000)).isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `no entry means no dot`() {
        assertThat(stateWith().presenceStateFor(direct, now)).isNull()
    }
}
