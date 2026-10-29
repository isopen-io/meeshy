package me.meeshy.sdk.model.presence

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.UserPresence
import org.junit.Test

/** Ce que la page de conversations a SERVI comme présence, et ce que le cache Room n'en garde pas. */
class ServedPresenceTest {

    private fun peer(id: String, online: Boolean?, last: String?) =
        ApiParticipant(id = "p-$id", userId = id, isOnline = online, lastActiveAt = last)

    private fun conversation(id: String, vararg participants: ApiParticipant) =
        ApiConversation(id = id, participants = participants.toList())

    @Test
    fun `a served participant yields its presence keyed by user id`() {
        val served = listOf(conversation("c1", peer("u1", true, "2026-10-29T10:00:00Z"))).servedPresence()

        assertThat(served.served).containsExactly("u1", UserPresence(true, "2026-10-29T10:00:00Z"))
        assertThat(served.masked).isEmpty()
    }

    @Test
    fun `a participant the payload says nothing about yields nothing, never offline`() {
        val served = listOf(conversation("c1", peer("u1", null, null), ApiParticipant(id = "p2", userId = "u2"))).servedPresence()

        assertThat(served).isEqualTo(ServedPresencePage())
    }

    @Test
    fun `a masked participant (false, no date) seeds nothing but is named as masked`() {
        val served = listOf(conversation("c1", peer("u1", false, null))).servedPresence()

        assertThat(served.served).isEmpty()
        assertThat(served.masked).containsExactly("u1")
    }

    @Test
    fun `a user served in one conversation is not masked by another`() {
        val served = listOf(
            conversation("c1", peer("u1", false, null)),
            conversation("c2", peer("u1", false, "2026-10-29T10:00:00Z")),
        ).servedPresence()

        assertThat(served.served).containsKey("u1")
        assertThat(served.masked).isEmpty()
    }

    @Test
    fun `a participant without account is ignored`() {
        val served = listOf(conversation("c1", ApiParticipant(id = "p1", userId = null, isOnline = true))).servedPresence()

        assertThat(served).isEqualTo(ServedPresencePage())
    }

    @Test
    fun `the same user in two conversations keeps the most recent served presence`() {
        val served = listOf(
            conversation("c1", peer("u1", false, "2026-10-29T10:00:00Z")),
            conversation("c2", peer("u1", false, "2026-10-29T11:00:00Z")),
            conversation("c3", peer("u1", false, "2026-10-29T09:00:00Z")),
        ).servedPresence()

        assertThat(served.served["u1"]).isEqualTo(UserPresence(false, "2026-10-29T11:00:00Z"))
    }

    @Test
    fun `the cached copy of a conversation carries no presence`() {
        val cached = conversation("c1", peer("u1", true, "2026-10-29T10:00:00Z")).withoutServedPresence()

        assertThat(cached.participants.single().isOnline).isNull()
        assertThat(cached.participants.single().lastActiveAt).isNull()
        assertThat(cached.participants.single().userId).isEqualTo("u1")
    }

    @Test
    fun `a conversation without presence is returned as the same instance`() {
        val plain = conversation("c1", ApiParticipant(id = "p1", userId = "u1"))

        assertThat(plain.withoutServedPresence()).isSameInstanceAs(plain)
    }
}
