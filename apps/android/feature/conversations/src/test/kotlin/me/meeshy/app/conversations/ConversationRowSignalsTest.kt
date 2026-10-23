package me.meeshy.app.conversations

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.presence.ConversationHere
import me.meeshy.sdk.model.presence.ConversationViewers
import me.meeshy.sdk.model.presence.ViewingChange
import me.meeshy.sdk.model.presence.ViewingEvent
import org.junit.Test

class ConversationRowSignalsTest {

    private fun direct(id: String, peer: String) = ApiConversation(
        id = id,
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-peer", userId = peer, displayName = "Peer"),
        ),
    )

    private fun group(id: String) = ApiConversation(
        id = id,
        type = "group",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-a", userId = "a", displayName = "A"),
            ApiParticipant(id = "p-b", userId = "b", displayName = "B"),
        ),
    )

    private fun viewersWith(user: String, conversation: String) =
        ConversationViewers().applying(ViewingEvent.Arrived(ViewingChange(user, conversation)))

    @Test
    fun `the sync indicator appears when a mutation is queued then disappears once delivered`() = runTest {
        val pending = MutableStateFlow<Set<String>>(emptySet())
        val source = rowSignalsSource(pending, MutableStateFlow(ConversationViewers()))

        source.observe().test {
            assertThat(awaitItem().hasPendingSync("c1")).isFalse()

            pending.value = setOf("c1")
            val queued = awaitItem()
            assertThat(queued.hasPendingSync("c1")).isTrue()
            assertThat(queued.hasPendingSync("c2")).isFalse()

            pending.value = emptySet()
            assertThat(awaitItem().hasPendingSync("c1")).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `the peer is here only on the conversation they have open`() {
        val signals = ConversationRowSignals(viewers = viewersWith("peer", "c1"))

        assertThat(signals.peerHere(direct("c1", "peer"), "me")).isEqualTo(ConversationHere.HERE)
        assertThat(signals.peerHere(direct("c2", "peer"), "me")).isEqualTo(ConversationHere.ABSENT)
    }

    @Test
    fun `nobody is here when the server announced nobody`() {
        assertThat(ConversationRowSignals().peerHere(direct("c1", "peer"), "me"))
            .isEqualTo(ConversationHere.ABSENT)
    }

    @Test
    fun `a group never shows a single peer here`() {
        val signals = ConversationRowSignals(viewers = viewersWith("a", "g1"))

        assertThat(signals.peerHere(group("g1"), "me")).isEqualTo(ConversationHere.ABSENT)
    }
}
