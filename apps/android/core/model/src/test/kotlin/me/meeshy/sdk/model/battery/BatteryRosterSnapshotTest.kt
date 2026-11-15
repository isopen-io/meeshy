package me.meeshy.sdk.model.battery

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le cache de la batterie (#14147) : au démarrage à froid, hors ligne ou sur un réseau lent, l'icône d'un épisode en
 * cours se peint depuis le dernier état servi — pour le MÊME compte seulement, et jamais au-delà du TTL de 24 h du
 * contrat (`BATTERY_CONFIG.ttlHours`).
 */
class BatteryRosterSnapshotTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val hour = 60L * 60 * 1000
    private val now = 1_800_000_000_000L

    private fun state(userId: String, measuredAt: Long, level: Int = 4) = BatteryState(
        userId = userId,
        phase = BatteryPhase.CRITICAL,
        level = level,
        charging = false,
        lowPower = true,
        estimatedMinutes = 25,
        measuredAtMillis = measuredAt,
        deviceLabel = "Pixel",
    )

    @Test
    fun `l'etat range se relit a l'identique apres un aller-retour JSON`() {
        val held = state("ada", now - hour)
        val roster = BatteryRoster().receive(held)
        val stored = json.encodeToString(BatteryRosterSnapshot.serializer(), BatteryRosterSnapshot.of("me", roster))
        val restored = json.decodeFromString(BatteryRosterSnapshot.serializer(), stored).restore("me", now)
        assertThat(restored.stateOf("ada")).isEqualTo(held)
    }

    @Test
    fun `un etat plus vieux que 24 h ne se repeint pas`() {
        val roster = BatteryRoster().receive(state("old", now - 25 * hour)).receive(state("fresh", now - 23 * hour))
        val restored = BatteryRosterSnapshot.of("me", roster).restore("me", now)
        assertThat(restored.byUser.keys).containsExactly("fresh")
    }

    @Test
    fun `le cache d'un autre compte, ou sans session, ne rend rien`() {
        val snapshot = BatteryRosterSnapshot.of("me", BatteryRoster().receive(state("ada", now)))
        assertThat(snapshot.restore("someone-else", now).byUser).isEmpty()
        assertThat(snapshot.restore(null, now).byUser).isEmpty()
    }

    @Test
    fun `le cache restaure n'est touche par personne : le rattrapage le remplace en entier`() {
        val restored = BatteryRosterSnapshot.of("me", BatteryRoster().receive(state("ada", now))).restore("me", now)
        val caught = restored.reconcile(emptyList(), since = restored.mark)
        assertThat(caught.byUser).isEmpty()
    }
}
