package me.meeshy.sdk.model.battery

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BatteryRosterTest {
    private fun state(userId: String = "a", level: Int = 20, measuredAt: Long = 1_000L, phase: BatteryPhase = BatteryPhase.LOW) =
        BatteryState(userId, phase, level, charging = false, lowPower = false, estimatedMinutes = null, measuredAtMillis = measuredAt, deviceLabel = null)

    @Test
    fun `un etat recu se lit pour sa personne`() {
        val roster = BatteryRoster().receive(state(level = 18))
        assertThat(roster.stateOf("a")?.level).isEqualTo(18)
        assertThat(roster.stateOf("b")).isNull()
        assertThat(roster.stateOf(null)).isNull()
    }

    @Test
    fun `un etat plus ancien que celui tenu est ignore`() {
        val roster = BatteryRoster().receive(state(level = 10, measuredAt = 2_000L)).receive(state(level = 25, measuredAt = 1_000L))
        assertThat(roster.stateOf("a")?.level).isEqualTo(10)
    }

    @Test
    fun `battery cleared efface l'icone`() {
        val roster = BatteryRoster().receive(state()).apply(BatteryEvent.Cleared("a", null))
        assertThat(roster.stateOf("a")).isNull()
    }

    @Test
    fun `le rattrapage fait foi pour qui n'a pas bouge depuis son depart`() {
        val start = BatteryRoster().receive(state(userId = "stale"))
        val roster = start.reconcile(listOf(state(userId = "b", level = 7)), since = start.mark)
        assertThat(roster.byUser.keys).containsExactly("b")
    }

    @Test
    fun `un effacement arrive pendant le rattrapage n'est pas ressuscite`() {
        val before = BatteryRoster().receive(state(userId = "a"))
        val since = before.mark
        val during = before.clear("a")
        val roster = during.reconcile(listOf(state(userId = "a", level = 12)), since)
        assertThat(roster.stateOf("a")).isNull()
    }

    @Test
    fun `un etat arrive pendant le rattrapage l'emporte sur la reponse`() {
        val since = BatteryRoster().mark
        val during = BatteryRoster().receive(state(userId = "a", level = 4, measuredAt = 5_000L))
        val roster = during.reconcile(listOf(state(userId = "a", level = 12, measuredAt = 1_000L)), since)
        assertThat(roster.stateOf("a")?.level).isEqualTo(4)
    }
}
