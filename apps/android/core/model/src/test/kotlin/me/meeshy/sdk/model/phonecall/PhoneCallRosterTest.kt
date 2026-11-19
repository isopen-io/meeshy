package me.meeshy.sdk.model.phonecall

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class PhoneCallRosterTest {
    private val hour = 60L * 60 * 1000
    private val now = 1_800_000_000_000L

    private fun state(userId: String = "a", since: Long = now - hour, expires: Long = now + hour) =
        PhoneCallState(userId, since, expires)

    @Test
    fun `un etat recu se lit pour sa personne tant qu'il n'a pas expire`() {
        val roster = PhoneCallRoster().receive(state())
        assertThat(roster.stateOf("a", now)?.sinceMillis).isEqualTo(now - hour)
        assertThat(roster.stateOf("b", now)).isNull()
        assertThat(roster.stateOf(null, now)).isNull()
    }

    @Test
    fun `un etat dont l'expiration est passee ne s'affiche plus`() {
        val roster = PhoneCallRoster().receive(state(expires = now))
        assertThat(roster.stateOf("a", now - 1)).isNotNull()
        assertThat(roster.stateOf("a", now)).isNull()
    }

    @Test
    fun `un etat recu remplace celui tenu, jamais ne fusionne`() {
        val roster = PhoneCallRoster()
            .receive(state(since = now - 2 * hour, expires = now + hour))
            .apply(PhoneCallEvent.Started(state(since = now - 10_000L, expires = now + 2 * hour), null))
        assertThat(roster.stateOf("a", now)).isEqualTo(state(since = now - 10_000L, expires = now + 2 * hour))
    }

    @Test
    fun `ended efface l'etat`() {
        val roster = PhoneCallRoster().receive(state()).apply(PhoneCallEvent.Ended("a", null))
        assertThat(roster.stateOf("a", now)).isNull()
    }

    @Test
    fun `le rattrapage fait foi pour qui n'a pas bouge depuis son depart`() {
        val start = PhoneCallRoster().receive(state(userId = "stale"))
        val roster = start.reconcile(listOf(state(userId = "b")), since = start.mark)
        assertThat(roster.byUser.keys).containsExactly("b")
    }

    @Test
    fun `un raccroche arrive pendant le rattrapage n'est pas ressuscite`() {
        val before = PhoneCallRoster().receive(state())
        val since = before.mark
        val roster = before.clear("a").reconcile(listOf(state()), since)
        assertThat(roster.stateOf("a", now)).isNull()
    }

    @Test
    fun `l'etat range se relit pour le meme compte seulement, et jamais expire`() {
        val json = Json { ignoreUnknownKeys = true }
        val roster = PhoneCallRoster()
            .receive(state(userId = "live"))
            .receive(state(userId = "gone", expires = now - 1))
        val stored = json.encodeToString(PhoneCallRosterSnapshot.serializer(), PhoneCallRosterSnapshot.of("me", roster))
        val snapshot = json.decodeFromString(PhoneCallRosterSnapshot.serializer(), stored)
        assertThat(snapshot.restore("me", now).byUser.keys).containsExactly("live")
        assertThat(snapshot.restore("me", now).stateOf("live", now)).isEqualTo(state(userId = "live"))
        assertThat(snapshot.restore("other", now).byUser).isEmpty()
        assertThat(snapshot.restore(null, now).byUser).isEmpty()
    }
}
