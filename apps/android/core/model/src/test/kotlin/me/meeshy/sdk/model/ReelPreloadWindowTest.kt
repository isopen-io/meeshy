package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReelPreloadWindow.ConnectionType
import me.meeshy.sdk.model.ReelPreloadWindow.Network
import me.meeshy.sdk.model.ReelPreloadWindow.Tier
import me.meeshy.sdk.model.ReelPreloadWindow.Visit
import me.meeshy.sdk.model.ReelPreloadWindow.VisitDirection
import me.meeshy.sdk.model.ReelPreloadWindow.Window
import me.meeshy.sdk.model.call.ThermalState
import me.meeshy.sdk.model.media.DeviceMediaTier
import org.junit.Test

class ReelPreloadWindowTest {
    private fun visits(dwellMs: Int, count: Int = 5, direction: VisitDirection = VisitDirection.FORWARD) =
        List(count) { Visit(dwellMs, direction) }

    private fun context(
        visits: List<Visit> = visits(500),
        network: Network = Network(),
        memory: Double? = null,
        lowPower: Boolean = false,
        thermal: ThermalState = ThermalState.NOMINAL,
        tier: DeviceMediaTier? = DeviceMediaTier.HIGH,
    ) = ReelPreloadWindow.Context(visits, network, memory, lowPower, thermal, tier)

    @Test
    fun `sans historique le rayon est le plancher`() {
        assertThat(ReelPreloadWindow.window(context(visits = emptyList()))).isEqualTo(Window(2, 2))
    }

    @Test
    fun `une seconde ou moins par reel ouvre dix devant`() {
        assertThat(ReelPreloadWindow.window(context(visits = visits(1_000))).ahead).isEqualTo(10)
    }

    @Test
    fun `dix secondes ou plus referme au plancher`() {
        assertThat(ReelPreloadWindow.window(context(visits = visits(10_000))).ahead).isEqualTo(2)
    }

    @Test
    fun `la pente est continue entre les deux`() {
        assertThat(ReelPreloadWindow.window(context(visits = visits(5_500))).ahead).isEqualTo(6)
    }

    @Test
    fun `la mediane resiste a un arret long isole`() {
        val history = visits(500, 4) + Visit(60_000, VisitDirection.FORWARD)
        assertThat(ReelPreloadWindow.window(context(visits = history)).ahead).isEqualTo(10)
    }

    @Test
    fun `un tiers de retours ouvre derriere autant que devant`() {
        val history = visits(500, 2) + visits(500, 1, VisitDirection.BACKWARD)
        assertThat(ReelPreloadWindow.window(context(visits = history))).isEqualTo(Window(10, 10))
        assertThat(ReelPreloadWindow.window(context(visits = visits(500))).behind).isEqualTo(2)
    }

    @Test
    fun `les visites traversees sous 150 ms ne sont pas enregistrees`() {
        val fast = Visit(149, VisitDirection.FORWARD)
        assertThat(ReelPreloadWindow.recording(fast, emptyList())).isEmpty()
        val history = visits(500, 12)
        val next = ReelPreloadWindow.recording(Visit(900, VisitDirection.BACKWARD), history)
        assertThat(next).hasSize(12)
        assertThat(next.last().dwellMs).isEqualTo(900)
    }

    @Test
    fun `chaque contrainte rend le plancher ou le plafond`() {
        fun ahead(c: ReelPreloadWindow.Context) = ReelPreloadWindow.window(c).ahead
        assertThat(ahead(context(network = Network(saveData = true)))).isEqualTo(2)
        assertThat(ahead(context(network = Network(ConnectionType.TWO_G)))).isEqualTo(2)
        assertThat(ahead(context(network = Network(ConnectionType.SLOW_2G)))).isEqualTo(2)
        assertThat(ahead(context(lowPower = true))).isEqualTo(2)
        assertThat(ahead(context(thermal = ThermalState.SERIOUS))).isEqualTo(2)
        assertThat(ahead(context(thermal = ThermalState.CRITICAL))).isEqualTo(2)
        assertThat(ahead(context(thermal = ThermalState.FAIR))).isEqualTo(10)
        assertThat(ahead(context(network = Network(ConnectionType.THREE_G)))).isEqualTo(4)
        assertThat(ahead(context(memory = 2.0))).isEqualTo(4)
        assertThat(ahead(context(memory = 4.0))).isEqualTo(10)
    }

    @Test
    fun `le tier de l appareil plafonne en dernier`() {
        fun ahead(tier: DeviceMediaTier?) = ReelPreloadWindow.window(context(tier = tier)).ahead
        assertThat(ahead(DeviceMediaTier.LOW)).isEqualTo(4)
        assertThat(ahead(DeviceMediaTier.MID)).isEqualTo(6)
        assertThat(ahead(DeviceMediaTier.PRO)).isEqualTo(10)
        assertThat(ahead(null)).isEqualTo(10)
        val constrained = context(tier = DeviceMediaTier.PRO, network = Network(saveData = true))
        assertThat(ReelPreloadWindow.window(constrained).ahead).isEqualTo(2)
    }

    @Test
    fun `un reseau facture plafonne comme la 3G`() {
        val network = Network.fromPath(isExpensive = true, isConstrained = false)
        assertThat(ReelPreloadWindow.window(context(network = network)).ahead).isEqualTo(4)
    }

    @Test
    fun `les paliers suivent la rarete de la ressource`() {
        val window = Window(ahead = 6, behind = 2)
        assertThat(ReelPreloadWindow.tier(0, window)).isEqualTo(Tier.PLAY)
        assertThat(ReelPreloadWindow.tier(1, window)).isEqualTo(Tier.DECODE)
        assertThat(ReelPreloadWindow.tier(-1, window)).isEqualTo(Tier.DECODE)
        assertThat(ReelPreloadWindow.tier(2, window)).isEqualTo(Tier.MOUNT)
        assertThat(ReelPreloadWindow.tier(5, window)).isEqualTo(Tier.PRIME)
        assertThat(ReelPreloadWindow.tier(-3, window)).isEqualTo(Tier.IDLE)
        assertThat(ReelPreloadWindow.tier(7, window)).isEqualTo(Tier.IDLE)
    }

    @Test
    fun `les budgets d octets divisent par quatre sous contrainte`() {
        val free = Network()
        val constrained = Network(saveData = true)
        assertThat(ReelPreloadWindow.primeBytes(Tier.MOUNT, 2, free)).isEqualTo(1_536 * 1_024)
        assertThat(ReelPreloadWindow.primeBytes(Tier.PRIME, 3, free)).isEqualTo(768 * 1_024)
        assertThat(ReelPreloadWindow.primeBytes(Tier.PRIME, 4, free)).isEqualTo(256 * 1_024)
        assertThat(ReelPreloadWindow.primeBytes(Tier.MOUNT, 2, constrained)).isEqualTo(384 * 1_024)
        assertThat(ReelPreloadWindow.primeBytes(Tier.PRIME, 4, Network(ConnectionType.TWO_G))).isEqualTo(64 * 1_024)
        assertThat(ReelPreloadWindow.primeBytes(Tier.DECODE, 1, free)).isEqualTo(0)
        assertThat(ReelPreloadWindow.primeBytes(Tier.IDLE, 9, free)).isEqualTo(0)
    }

    @Test
    fun `les cibles d amorce vont du plus proche, devant avant derriere, sans doublon`() {
        val urls = listOf("m-2", "m-1", "cur", "p1", "p2", "p1")
        val targets = ReelPreloadWindow.primeTargets(urls, 2, Window(3, 2), Network())
        assertThat(targets.map { it.url }).containsExactly("p2", "m-2", "p1").inOrder()
    }

    @Test
    fun `le plan enumere les paliers dans l ordre et exclut le joue et l idle`() {
        val plan = ReelPreloadWindow.plan(count = 4, activeIndex = 1, window = Window(2, 2))
        assertThat(plan.map { it.index to it.tier }).containsExactly(
            2 to Tier.DECODE, 0 to Tier.DECODE, 3 to Tier.MOUNT,
        ).inOrder()
    }

    @Test
    fun `l horloge des visites enregistre le temps passe et le sens`() {
        val clock = ReelVisitClock().enter(0, 0).enter(1, 2_000).enter(0, 2_050).enter(0, 9_000).enter(2, 5_050)
        assertThat(clock.visits).containsExactly(
            Visit(2_000, VisitDirection.FORWARD),
            Visit(3_000, VisitDirection.FORWARD),
        ).inOrder()
    }
}
