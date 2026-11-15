package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.SocialEventStamp
import me.meeshy.sdk.model.analytics.StampedSocialEvent
import org.junit.Test

class VisitorReachQueueTest {

    private fun view(id: String, postId: String = "p$id") =
        StampedSocialEvent(SocialEvent.View(postId), SocialEventStamp(id, 1_000L))

    private fun impression(id: String) =
        StampedSocialEvent(SocialEvent.Impression("p$id", "feed"), SocialEventStamp(id, 1_000L))

    private fun open(id: String) =
        StampedSocialEvent(SocialEvent.Open("p$id"), SocialEventStamp(id, 1_000L))

    private val identity = VisitorReachQueue.identityOf("visitor_abc")

    @Test
    fun `la file garde l'ordre d'arrivee`() {
        val queue = VisitorReachQueue.EMPTY.append(listOf(view("1"), view("2")), identity).append(listOf(view("3")), identity)
        assertThat(queue.entries.map { it.stamped.stamp.eventId }).containsExactly("1", "2", "3").inOrder()
    }

    @Test
    fun `la file est plafonnee a 500 et ecarte les plus anciens`() {
        val queue = VisitorReachQueue.EMPTY.append((1..520).map { view("$it") }, identity)
        assertThat(queue.entries).hasSize(500)
        assertThat(queue.entries.first().stamped.stamp.eventId).isEqualTo("21")
        assertThat(queue.entries.last().stamped.stamp.eventId).isEqualTo("520")
    }

    @Test
    fun `l'identite est une empreinte SHA-256 et jamais la cle`() {
        assertThat(identity).hasLength(64)
        assertThat(identity).doesNotContain("visitor_")
        assertThat(VisitorReachQueue.identityOf("a"))
            .isEqualTo("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb")
    }

    @Test
    fun `l'acquittement ne retire que les evenements acquittes`() {
        val queue = VisitorReachQueue.EMPTY.append(listOf(view("1"), view("2"), view("3")), identity)
        val after = queue.acknowledge(setOf("1", "3"))
        assertThat(after.entries.map { it.stamped.stamp.eventId }).containsExactly("2")
    }

    @Test
    fun `le vidage est idempotent`() {
        val queue = VisitorReachQueue.EMPTY.append(listOf(view("1")), identity)
        assertThat(queue.acknowledge(setOf("1")).acknowledge(setOf("1")).entries).isEmpty()
        assertThat(queue.acknowledge(emptySet())).isEqualTo(queue)
    }

    @Test
    fun `la file se restaure depuis son JSON`() {
        val queue = VisitorReachQueue.EMPTY.append(listOf(view("1"), impression("2"), open("3")), identity)
        assertThat(VisitorReachQueue.restore(queue.toJson())).isEqualTo(queue)
    }

    @Test
    fun `la file persistee ne contient jamais la cle`() {
        val json = VisitorReachQueue.EMPTY.append(listOf(view("1")), identity).toJson()
        assertThat(json).doesNotContain("visitor_abc")
        assertThat(json).contains(identity)
    }

    @Test
    fun `un JSON illisible ou absent donne une file vide`() {
        assertThat(VisitorReachQueue.restore(null).entries).isEmpty()
        assertThat(VisitorReachQueue.restore("{pas du json").entries).isEmpty()
    }

    @Test
    fun `les vues, impressions et ouvertures partent en requetes separees par identite`() {
        val other = VisitorReachQueue.identityOf("visitor_zzz")
        val queue = VisitorReachQueue.EMPTY
            .append(listOf(open("1"), impression("2"), view("3")), identity)
            .append(listOf(view("4")), other)
        val requests = queue.requests().map { group -> group.map { it.stamped.stamp.eventId } }
        assertThat(requests).containsExactly(listOf("3"), listOf("2"), listOf("1"), listOf("4")).inOrder()
    }
}
