package me.meeshy.sdk.model.presence

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ConversationViewersTest {

    private fun change(user: String, conversation: String = "c1", focus: Boolean = false) =
        ViewingChange(userId = user, conversationId = conversation, focus = focus)

    private fun viewers(vararg events: ViewingEvent) =
        events.fold(ConversationViewers()) { acc, event -> acc.applying(event) }

    @Test
    fun `nobody is here by default`() {
        assertThat(ConversationViewers().here("u1", "c1")).isEqualTo(ConversationHere.ABSENT)
    }

    @Test
    fun `an arrival makes the peer here and a departure removes them`() {
        val here = viewers(ViewingEvent.Arrived(change("u1")))
        assertThat(here.here("u1", "c1")).isEqualTo(ConversationHere.HERE)
        val left = here.applying(ViewingEvent.Left(change("u1")))
        assertThat(left.here("u1", "c1")).isEqualTo(ConversationHere.ABSENT)
    }

    @Test
    fun `an activity makes a present peer active and a focused one focused`() {
        val base = viewers(ViewingEvent.Arrived(change("u1")))
        assertThat(base.applying(ViewingEvent.Active(change("u1"))).here("u1", "c1")).isEqualTo(ConversationHere.ACTIVE)
        assertThat(base.applying(ViewingEvent.Active(change("u1", focus = true))).here("u1", "c1"))
            .isEqualTo(ConversationHere.FOCUSED)
    }

    @Test
    fun `an activity without focus ends the focus`() {
        val focused = viewers(ViewingEvent.Arrived(change("u1")), ViewingEvent.Active(change("u1", focus = true)))
        assertThat(focused.applying(ViewingEvent.Active(change("u1"))).here("u1", "c1")).isEqualTo(ConversationHere.ACTIVE)
    }

    @Test
    fun `resting returns an active peer to here without removing them`() {
        val active = viewers(ViewingEvent.Arrived(change("u1")), ViewingEvent.Active(change("u1", focus = true)))
        assertThat(active.resting("u1", "c1").here("u1", "c1")).isEqualTo(ConversationHere.HERE)
    }

    @Test
    fun `an activity alone never makes an absent peer here`() {
        assertThat(viewers(ViewingEvent.Active(change("u1"))).here("u1", "c1")).isEqualTo(ConversationHere.ABSENT)
    }

    @Test
    fun `a snapshot replaces the whole set of a conversation only`() {
        val state = viewers(
            ViewingEvent.Arrived(change("u1")),
            ViewingEvent.Arrived(change("u9", "c2")),
            ViewingEvent.Snapshot(ViewingSnapshot("c1", listOf("u2", "u3"))),
        )
        assertThat(state.usersIn("c1")).containsExactly("u2", "u3")
        assertThat(state.usersIn("c2")).containsExactly("u9")
    }

    @Test
    fun `a departure also rests the peer`() {
        val state = viewers(
            ViewingEvent.Arrived(change("u1")),
            ViewingEvent.Active(change("u1")),
            ViewingEvent.Left(change("u1")),
            ViewingEvent.Arrived(change("u1")),
        )
        assertThat(state.here("u1", "c1")).isEqualTo(ConversationHere.HERE)
    }

    @Test
    fun `a new session forgets everything`() {
        val state = viewers(ViewingEvent.Arrived(change("u1")), ViewingEvent.SessionStarted)
        assertThat(state).isEqualTo(ConversationViewers())
    }

    @Test
    fun `roster projects the three sets of a conversation`() {
        val state = viewers(
            ViewingEvent.Arrived(change("u1")),
            ViewingEvent.Arrived(change("u2")),
            ViewingEvent.Arrived(change("u3")),
            ViewingEvent.Active(change("u2")),
            ViewingEvent.Active(change("u3", focus = true)),
        )
        val roster = state.roster("c1")
        assertThat(roster["u1"]).isEqualTo(ConversationHere.HERE)
        assertThat(roster["u2"]).isEqualTo(ConversationHere.ACTIVE)
        assertThat(roster["u3"]).isEqualTo(ConversationHere.FOCUSED)
        assertThat(roster["nobody"]).isEqualTo(ConversationHere.ABSENT)
        assertThat(ConversationHere.FOCUSED.isActive).isTrue()
        assertThat(ConversationHere.HERE.isHere).isTrue()
    }

    @Test
    fun `payloads decode tolerantly with focus defaulting to false`() {
        val json = Json { ignoreUnknownKeys = true }
        val decoded = json.decodeFromString<ViewingChange>("""{"userId":"u1","conversationId":"c1","extra":1}""")
        assertThat(decoded).isEqualTo(change("u1"))
        val snapshot = json.decodeFromString<ViewingSnapshot>("""{"conversationId":"c1","userIds":["a","b"]}""")
        assertThat(snapshot.userIds).containsExactly("a", "b").inOrder()
    }
}
