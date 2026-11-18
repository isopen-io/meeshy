package me.meeshy.sdk.model.inactivity

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class InactivityRosterTest {
    private val hour = 60L * 60 * 1000
    private val now = 1_800_000_000_000L

    private fun state(
        userId: String = "a",
        since: Long = 1_000L,
        battery: InactivityLastBattery? = null,
        position: InactivityLastPosition? = null,
    ) = InactivityAlertState(userId, since, alertedAtMillis = since + 1, lastPosition = position, lastBattery = battery)

    @Test
    fun `un etat recu se lit pour sa personne`() {
        val roster = InactivityRoster().receive(state())
        assertThat(roster.stateOf("a")?.inactiveSinceMillis).isEqualTo(1_000L)
        assertThat(roster.stateOf("b")).isNull()
        assertThat(roster.stateOf(null)).isNull()
    }

    @Test
    fun `un etat d'un episode plus ancien que celui tenu est ignore`() {
        val roster = InactivityRoster()
            .receive(state(since = 2_000L, battery = InactivityLastBattery(9, 2_000L)))
            .receive(state(since = 1_000L))
        assertThat(roster.stateOf("a")?.lastBattery?.level).isEqualTo(9)
    }

    @Test
    fun `cleared efface l'etat`() {
        val roster = InactivityRoster().receive(state()).apply(InactivityEvent.Cleared("a", null))
        assertThat(roster.stateOf("a")).isNull()
    }

    @Test
    fun `le rattrapage fait foi pour qui n'a pas bouge depuis son depart`() {
        val start = InactivityRoster().receive(state(userId = "stale"))
        val roster = start.reconcile(listOf(state(userId = "b")), since = start.mark)
        assertThat(roster.byUser.keys).containsExactly("b")
    }

    @Test
    fun `un retour arrive pendant le rattrapage n'est pas ressuscite`() {
        val before = InactivityRoster().receive(state())
        val since = before.mark
        val roster = before.clear("a").reconcile(listOf(state()), since)
        assertThat(roster.stateOf("a")).isNull()
    }

    @Test
    fun `l'etat range se relit a l'identique, batterie et position comprises, pour le meme compte seulement`() {
        val held = state(
            userId = "jacques",
            since = now - hour,
            battery = InactivityLastBattery(9, now - hour),
            position = InactivityLastPosition(48.85, 2.35, 12.0, now - hour),
        )
        val json = Json { ignoreUnknownKeys = true }
        val stored = json.encodeToString(
            InactivityRosterSnapshot.serializer(),
            InactivityRosterSnapshot.of("me", InactivityRoster().receive(held)),
        )
        val snapshot = json.decodeFromString(InactivityRosterSnapshot.serializer(), stored)
        assertThat(snapshot.restore("me", now).stateOf("jacques")).isEqualTo(held)
        assertThat(snapshot.restore("other", now).byUser).isEmpty()
        assertThat(snapshot.restore(null, now).byUser).isEmpty()
    }

    @Test
    fun `un etat plus vieux que 72 h ne se repeint pas`() {
        val roster = InactivityRoster()
            .receive(state(userId = "old", since = now - 73 * hour))
            .receive(state(userId = "fresh", since = now - 71 * hour))
        assertThat(InactivityRosterSnapshot.of("me", roster).restore("me", now).byUser.keys).containsExactly("fresh")
    }
}
