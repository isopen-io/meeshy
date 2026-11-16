package me.meeshy.sdk.model.phonereachability

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class PhoneReachabilityRosterTest {
    private val hour = 60L * 60 * 1000
    private val now = 1_800_000_000_000L

    private fun state(userId: String = "a", since: Long = 1_000L, cause: PhoneUnreachableCause = PhoneUnreachableCause.NETWORK) =
        PhoneReachabilityState(userId, since, cause)

    @Test
    fun `un etat recu se lit pour sa personne`() {
        val roster = PhoneReachabilityRoster().receive(state())
        assertThat(roster.stateOf("a")?.cause).isEqualTo(PhoneUnreachableCause.NETWORK)
        assertThat(roster.stateOf("b")).isNull()
        assertThat(roster.stateOf(null)).isNull()
    }

    @Test
    fun `un etat d'un episode plus ancien que celui tenu est ignore`() {
        val roster = PhoneReachabilityRoster()
            .receive(state(since = 2_000L, cause = PhoneUnreachableCause.BATTERY))
            .receive(state(since = 1_000L))
        assertThat(roster.stateOf("a")?.cause).isEqualTo(PhoneUnreachableCause.BATTERY)
    }

    @Test
    fun `phone reachable efface le glyphe`() {
        val roster = PhoneReachabilityRoster().receive(state()).apply(PhoneReachabilityEvent.Reachable("a", null))
        assertThat(roster.stateOf("a")).isNull()
    }

    @Test
    fun `le rattrapage fait foi pour qui n'a pas bouge depuis son depart`() {
        val start = PhoneReachabilityRoster().receive(state(userId = "stale"))
        val roster = start.reconcile(listOf(state(userId = "b")), since = start.mark)
        assertThat(roster.byUser.keys).containsExactly("b")
    }

    @Test
    fun `un retour arrive pendant le rattrapage n'est pas ressuscite`() {
        val before = PhoneReachabilityRoster().receive(state())
        val since = before.mark
        val roster = before.clear("a").reconcile(listOf(state()), since)
        assertThat(roster.stateOf("a")).isNull()
    }

    @Test
    fun `l'etat range se relit a l'identique et pour le meme compte seulement`() {
        val held = state(userId = "ada", since = now - hour, cause = PhoneUnreachableCause.BATTERY)
        val json = Json { ignoreUnknownKeys = true }
        val stored = json.encodeToString(
            PhoneReachabilityRosterSnapshot.serializer(),
            PhoneReachabilityRosterSnapshot.of("me", PhoneReachabilityRoster().receive(held)),
        )
        val snapshot = json.decodeFromString(PhoneReachabilityRosterSnapshot.serializer(), stored)
        assertThat(snapshot.restore("me", now).stateOf("ada")).isEqualTo(held)
        assertThat(snapshot.restore("other", now).byUser).isEmpty()
        assertThat(snapshot.restore(null, now).byUser).isEmpty()
    }

    @Test
    fun `un etat plus vieux que 72 h ne se repeint pas`() {
        val roster = PhoneReachabilityRoster()
            .receive(state(userId = "old", since = now - 73 * hour))
            .receive(state(userId = "fresh", since = now - 71 * hour))
        assertThat(PhoneReachabilityRosterSnapshot.of("me", roster).restore("me", now).byUser.keys).containsExactly("fresh")
    }
}
