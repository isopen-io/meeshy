package me.meeshy.sdk.model.fall

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.inactivity.InactivityLastBattery
import me.meeshy.sdk.model.inactivity.InactivityLastPosition
import org.junit.Test

class FallRosterTest {
    private val minute = 60L * 1000
    private val now = 1_800_000_000_000L

    private fun state(
        userId: String = "a",
        detected: Long = now - 5 * minute,
        expires: Long = now + 6 * 60 * minute,
        battery: InactivityLastBattery? = null,
        position: InactivityLastPosition? = null,
    ) = FallState(userId, detected, expires, lastPosition = position, lastBattery = battery)

    @Test
    fun `un etat recu se lit pour sa personne, tant que son expiration n'est pas passee`() {
        val roster = FallRoster().receive(state())
        assertThat(roster.stateOf("a", now)?.detectedAtMillis).isEqualTo(now - 5 * minute)
        assertThat(roster.stateOf("b", now)).isNull()
        assertThat(roster.stateOf(null, now)).isNull()
        assertThat(roster.stateOf("a", now + 6 * 60 * minute)).isNull()
    }

    @Test
    fun `une chute plus ancienne que celle tenue est ignoree`() {
        val roster = FallRoster()
            .receive(state(detected = now - minute, battery = InactivityLastBattery(41, now)))
            .receive(state(detected = now - 60 * minute))
        assertThat(roster.stateOf("a", now)?.lastBattery?.level).isEqualTo(41)
    }

    @Test
    fun `cleared efface l'etat, quelle que soit la raison`() {
        val roster = FallRoster().receive(state()).apply(FallEvent.Cleared("a", FallClearedReason.EXPIRED))
        assertThat(roster.stateOf("a", now)).isNull()
    }

    @Test
    fun `le rattrapage fait foi pour qui n'a pas bouge depuis son depart`() {
        val start = FallRoster().receive(state(userId = "stale"))
        val roster = start.reconcile(listOf(state(userId = "b")), since = start.mark)
        assertThat(roster.byUser.keys).containsExactly("b")
    }

    @Test
    fun `une levee arrivee pendant le rattrapage n'est pas ressuscitee`() {
        val before = FallRoster().receive(state())
        val since = before.mark
        val roster = before.clear("a").reconcile(listOf(state()), since)
        assertThat(roster.stateOf("a", now)).isNull()
    }

    @Test
    fun `l'etat range se relit avec sa batterie mais JAMAIS sa position, pour le meme compte seulement`() {
        val held = state(userId = "awa", battery = InactivityLastBattery(41, now), position = InactivityLastPosition(48.85, 2.35, 20.0, now))
        val snapshot = FallRosterSnapshot.of("me", FallRoster().receive(held))
        val encoded = Json.encodeToString(FallRosterSnapshot.serializer(), snapshot)
        assertThat(encoded).doesNotContain("48.85")
        assertThat(encoded).doesNotContain("latitude")
        val restored = Json.decodeFromString(FallRosterSnapshot.serializer(), encoded).restore("me", now)
        assertThat(restored.stateOf("awa", now)?.lastBattery?.level).isEqualTo(41)
        assertThat(restored.stateOf("awa", now)?.lastPosition).isNull()
        assertThat(snapshot.restore("other", now).byUser).isEmpty()
        assertThat(snapshot.restore(null, now).byUser).isEmpty()
    }

    @Test
    fun `un etat range dont l'expiration est passee ne se repeint pas`() {
        val snapshot = FallRosterSnapshot.of("me", FallRoster().receive(state(expires = now + minute)))
        assertThat(snapshot.restore("me", now + 2 * minute).byUser).isEmpty()
    }
}
