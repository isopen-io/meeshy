package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.ReelPreloadWindow
import me.meeshy.sdk.model.ReelPreloadWindow.Tier
import me.meeshy.sdk.model.call.ThermalState
import me.meeshy.sdk.model.media.DeviceMediaTier
import org.junit.Test

class ReelPreloadConstraintsTest {

    private val fast = List(6) { ReelPreloadWindow.Visit(400, ReelPreloadWindow.VisitDirection.FORWARD) }

    private fun inputs(
        dataSaver: Boolean = false,
        powerSave: Boolean = false,
        thermal: Int = 0,
        lowRam: Boolean = false,
        totalGb: Long = 8,
        memoryClass: Int = 256,
        condition: NetworkCondition = NetworkCondition.WIFI,
        tier: DeviceMediaTier? = DeviceMediaTier.HIGH,
    ) = ReelPreloadInputs(dataSaver, powerSave, thermal, lowRam, totalGb * 1_073_741_824L, memoryClass, condition, tier)

    private fun ahead(inputs: ReelPreloadInputs) =
        ReelPreloadWindow.window(ReelPreloadConstraints.context(inputs, fast)).ahead

    @Test
    fun `sans contrainte un balayage rapide ouvre la fenetre au maximum`() {
        assertThat(ahead(inputs())).isEqualTo(10)
    }

    @Test
    fun `Data Saver ramene au plancher`() {
        assertThat(ahead(inputs(dataSaver = true))).isEqualTo(2)
    }

    @Test
    fun `economie d'energie ramene au plancher`() {
        assertThat(ahead(inputs(powerSave = true))).isEqualTo(2)
    }

    @Test
    fun `chaleur severe ramene au plancher mais chaleur moderee non`() {
        assertThat(ahead(inputs(thermal = 3))).isEqualTo(2)
        assertThat(ahead(inputs(thermal = 2))).isEqualTo(10)
    }

    @Test
    fun `RAM faible plafonne a quatre`() {
        assertThat(ahead(inputs(lowRam = true))).isEqualTo(4)
        assertThat(ahead(inputs(totalGb = 2))).isEqualTo(4)
    }

    @Test
    fun `cellulaire plafonne a quatre`() {
        assertThat(ahead(inputs(condition = NetworkCondition.GOOD_CELLULAR))).isEqualTo(4)
    }

    @Test
    fun `la classe d'appareil plafonne en dernier`() {
        assertThat(ahead(inputs(tier = DeviceMediaTier.LOW))).isEqualTo(4)
        assertThat(ahead(inputs(tier = DeviceMediaTier.MID))).isEqualTo(6)
        assertThat(ahead(inputs(tier = null))).isEqualTo(10)
    }

    @Test
    fun `le contexte porte chaleur et economie d'energie`() {
        val context = ReelPreloadConstraints.context(inputs(thermal = 4, powerSave = true), emptyList())
        assertThat(context.thermalState).isEqualTo(ThermalState.CRITICAL)
        assertThat(context.lowPower).isTrue()
    }

    @Test
    fun `hors ligne rien ne part`() {
        Tier.values().forEach {
            assertThat(ReelPreloadConstraints.mayTransfer(it, NetworkCondition.OFFLINE, AutoDownloadPolicy.ALWAYS)).isFalse()
        }
    }

    @Test
    fun `sur wifi tous les paliers partent`() {
        Tier.values().forEach {
            assertThat(ReelPreloadConstraints.mayTransfer(it, NetworkCondition.WIFI, AutoDownloadPolicy.WIFI_ONLY)).isTrue()
        }
    }

    @Test
    fun `sur cellulaire prime et idle exigent un reglage qui l'autorise`() {
        assertThat(ReelPreloadConstraints.mayTransfer(Tier.DECODE, NetworkCondition.GOOD_CELLULAR, AutoDownloadPolicy.WIFI_ONLY)).isTrue()
        assertThat(ReelPreloadConstraints.mayTransfer(Tier.PRIME, NetworkCondition.GOOD_CELLULAR, AutoDownloadPolicy.WIFI_ONLY)).isFalse()
        assertThat(ReelPreloadConstraints.mayTransfer(Tier.PRIME, NetworkCondition.GOOD_CELLULAR, AutoDownloadPolicy.ALWAYS)).isTrue()
    }
}
