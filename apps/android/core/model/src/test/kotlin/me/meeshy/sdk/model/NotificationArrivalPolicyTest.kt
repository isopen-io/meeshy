package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationArrivalPolicyTest {

    private fun notification(id: String, conversationId: String? = null) = ApiNotification(
        id = id,
        context = NotificationContext(conversationId = conversationId),
        state = NotificationState(isRead = false, createdAt = "2024-01-01"),
    )

    @Test
    fun `une arrivee sur un autre contenu est non lue`() {
        val outcome = NotificationArrivalPolicy.empty().admit(notification("n1", "c1"), setOf("c2"), 0)
        assertThat(outcome.arrival).isEqualTo(NotificationArrival.Unread)
    }

    @Test
    fun `une arrivee sur la conversation ouverte nait lue`() {
        val outcome = NotificationArrivalPolicy.empty().admit(notification("n1", "c1"), setOf("c1"), 0)
        assertThat(outcome.arrival).isEqualTo(NotificationArrival.ConsumedOnArrival)
    }

    @Test
    fun `une arrivee sans conversation n'est jamais consommee`() {
        val outcome = NotificationArrivalPolicy.empty().admit(notification("n1"), setOf("c1"), 0)
        assertThat(outcome.arrival).isEqualTo(NotificationArrival.Unread)
    }

    @Test
    fun `la meme livraison sous 2 s est un doublon`() {
        val first = NotificationArrivalPolicy.empty().admit(notification("n1"), emptySet(), 0)
        val second = first.policy.admit(notification("n1"), emptySet(), 1_999)
        assertThat(second.arrival).isEqualTo(NotificationArrival.Duplicate)
    }

    @Test
    fun `la meme livraison apres 2 s est de nouveau admise`() {
        val first = NotificationArrivalPolicy.empty().admit(notification("n1"), emptySet(), 0)
        val second = first.policy.admit(notification("n1"), emptySet(), 2_000)
        assertThat(second.arrival).isEqualTo(NotificationArrival.Unread)
    }

    @Test
    fun `un doublon sur la conversation ouverte reste un doublon`() {
        val first = NotificationArrivalPolicy.empty().admit(notification("n1", "c1"), setOf("c1"), 0)
        val second = first.policy.admit(notification("n1", "c1"), setOf("c1"), 500)
        assertThat(second.arrival).isEqualTo(NotificationArrival.Duplicate)
    }

    @Test
    fun `deux notifications distinctes ne se dedoublonnent pas`() {
        val first = NotificationArrivalPolicy.empty().admit(notification("n1"), emptySet(), 0)
        val second = first.policy.admit(notification("n2"), emptySet(), 10)
        assertThat(second.arrival).isEqualTo(NotificationArrival.Unread)
    }

    @Test
    fun `bornRead marque lue sans toucher au reste`() {
        val read = notification("n1", "c1").bornRead()
        assertThat(read.state.isRead).isTrue()
        assertThat(read.context?.conversationId).isEqualTo("c1")
    }
}
