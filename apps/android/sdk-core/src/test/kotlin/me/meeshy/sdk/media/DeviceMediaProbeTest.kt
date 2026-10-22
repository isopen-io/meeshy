package me.meeshy.sdk.media

import android.app.ActivityManager
import android.content.Context
import android.os.PowerManager
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import me.meeshy.sdk.model.media.DeviceMediaSignals
import me.meeshy.sdk.model.media.DeviceMediaTier
import me.meeshy.sdk.model.media.DeviceThermalState
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * La sonde range l'appareil VIVANT : le matériel est lu une fois, l'économie
 * d'énergie et la chaleur à chaque lecture. Les fournisseurs sont injectés pour
 * prouver le cycle de vie ; les services système de Robolectric prouvent que la
 * projection `ActivityManager` / `PowerManager` vers les entrées de la loi
 * respecte la mémoire rapportée, le verdict `isLowRamDevice` et le mode économie.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26])
class DeviceMediaProbeTest {

    private val gibibyte = 1_073_741_824L

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun flagship() = DeviceMediaSignals(
        memoryGb = 7.5,
        cores = 8,
        maxFps = 120,
        hwHevc = true,
        hwAv1 = true,
    )

    private class Counted(
        val hardware: DeviceMediaSignals,
        val lowPower: AtomicBoolean = AtomicBoolean(false),
        val thermal: AtomicReference<DeviceThermalState> = AtomicReference(DeviceThermalState.NOMINAL),
    ) {
        val hardwareReads = AtomicInteger()
        val lowPowerReads = AtomicInteger()
        val thermalReads = AtomicInteger()

        fun probe() = DeviceMediaProbe(
            readHardware = { hardwareReads.incrementAndGet(); hardware },
            readLowPower = { lowPowerReads.incrementAndGet(); lowPower.get() },
            readThermal = { thermalReads.incrementAndGet(); thermal.get() },
        )
    }

    private fun setMemory(totalMemBytes: Long, memoryClassMb: Int = 256, lowRam: Boolean = false) {
        val manager = context.getSystemService(ActivityManager::class.java)
        shadowOf(manager).setMemoryInfo(ActivityManager.MemoryInfo().apply { totalMem = totalMemBytes })
        shadowOf(manager).setMemoryClass(memoryClassMb)
        shadowOf(manager).setIsLowRamDevice(lowRam)
    }

    // ----- cycle de vie : matériel une fois, énergie et chaleur à chaque lecture -----

    @Test
    fun `le materiel est lu une seule fois quel que soit le nombre de lectures`() {
        val counted = Counted(flagship())
        val probe = counted.probe()

        repeat(5) { probe.current() }

        assertThat(counted.hardwareReads.get()).isEqualTo(1)
        assertThat(counted.lowPowerReads.get()).isEqualTo(5)
        assertThat(counted.thermalReads.get()).isEqualTo(5)
    }

    @Test
    fun `amorcer la sonde lit le materiel sans toucher a l energie ni a la chaleur`() {
        val counted = Counted(flagship())
        val probe = counted.probe()

        val warmed = probe.warmUp()
        probe.current()

        assertThat(warmed).isEqualTo(flagship())
        assertThat(counted.hardwareReads.get()).isEqualTo(1)
        assertThat(counted.lowPowerReads.get()).isEqualTo(1)
    }

    @Test
    fun `l economie d energie est relue a chaque lecture`() {
        val counted = Counted(flagship())
        val probe = counted.probe()

        val before = probe.current()
        counted.lowPower.set(true)
        val saving = probe.current()
        counted.lowPower.set(false)
        val after = probe.current()

        assertThat(listOf(before, saving, after))
            .containsExactly(DeviceMediaTier.PRO, DeviceMediaTier.MID, DeviceMediaTier.PRO)
            .inOrder()
    }

    @Test
    fun `un appareil qui chauffe descend en bas puis remonte au refroidissement`() {
        val counted = Counted(flagship())
        val probe = counted.probe()

        val tiers = listOf(
            DeviceThermalState.NOMINAL,
            DeviceThermalState.SERIOUS,
            DeviceThermalState.CRITICAL,
            DeviceThermalState.FAIR,
        ).map { state ->
            counted.thermal.set(state)
            probe.current()
        }

        assertThat(tiers).containsExactly(
            DeviceMediaTier.PRO,
            DeviceMediaTier.LOW,
            DeviceMediaTier.LOW,
            DeviceMediaTier.PRO,
        ).inOrder()
    }

    @Test
    fun `les entrees rendues a la loi portent le materiel et l etat du moment`() {
        val counted = Counted(flagship(), lowPower = AtomicBoolean(true))
        counted.thermal.set(DeviceThermalState.FAIR)

        val inputs = counted.probe().inputs()

        assertThat(inputs.memoryGb).isEqualTo(7.5)
        assertThat(inputs.cores).isEqualTo(8)
        assertThat(inputs.maxFps).isEqualTo(120)
        assertThat(inputs.hwHevc).isTrue()
        assertThat(inputs.hwAv1).isTrue()
        assertThat(inputs.lowPower).isTrue()
        assertThat(inputs.thermal).isEqualTo(DeviceThermalState.FAIR)
    }

    // ----- état thermique d'Android vers les quatre crans de la loi -----

    @Test
    fun `les sept etats thermiques d Android se rangent sur les quatre de la loi`() {
        val mapped = listOf(
            PowerManager.THERMAL_STATUS_NONE,
            PowerManager.THERMAL_STATUS_LIGHT,
            PowerManager.THERMAL_STATUS_MODERATE,
            PowerManager.THERMAL_STATUS_SEVERE,
            PowerManager.THERMAL_STATUS_CRITICAL,
            PowerManager.THERMAL_STATUS_EMERGENCY,
            PowerManager.THERMAL_STATUS_SHUTDOWN,
        ).map(AndroidDeviceSignals::thermalState)

        assertThat(mapped).containsExactly(
            DeviceThermalState.NOMINAL,
            DeviceThermalState.FAIR,
            DeviceThermalState.FAIR,
            DeviceThermalState.SERIOUS,
            DeviceThermalState.CRITICAL,
            DeviceThermalState.CRITICAL,
            DeviceThermalState.CRITICAL,
        ).inOrder()
    }

    // ----- ActivityManager et PowerManager vers les entrées de la loi -----

    @Test
    fun `la memoire rapportee par ActivityManager devient des Gio`() {
        setMemory(totalMemBytes = 6 * gibibyte)

        val inputs = DeviceMediaProbe.forContext(context).inputs()

        assertThat(inputs.memoryGb).isEqualTo(6.0)
    }

    @Test
    fun `un appareil que le systeme declare low ram est plafonne sous le palier moyen`() {
        setMemory(totalMemBytes = 3 * gibibyte, lowRam = true)

        val inputs = DeviceMediaProbe.forContext(context).inputs()

        assertThat(inputs.memoryGb).isAtMost(DeviceMediaSignals.LOW_RAM_CEILING_GB)
        assertThat(inputs.memoryGb).isLessThan(DeviceMediaTier.MID_MEMORY_GB)
    }

    @Test
    fun `un tas applicatif minuscule plafonne la memoire comme un appareil low ram`() {
        setMemory(totalMemBytes = 4 * gibibyte, memoryClassMb = 48)

        val inputs = DeviceMediaProbe.forContext(context).inputs()

        assertThat(inputs.memoryGb).isAtMost(DeviceMediaSignals.LOW_RAM_CEILING_GB)
    }

    @Test
    fun `la memoire ne se relit pas apres la premiere lecture`() {
        setMemory(totalMemBytes = 6 * gibibyte)
        val probe = DeviceMediaProbe.forContext(context)
        val first = probe.inputs().memoryGb

        setMemory(totalMemBytes = 1 * gibibyte)

        assertThat(probe.inputs().memoryGb).isEqualTo(first)
    }

    @Test
    fun `le mode economie d energie de PowerManager se relit a chaque lecture`() {
        setMemory(totalMemBytes = 6 * gibibyte)
        val power = context.getSystemService(PowerManager::class.java)
        val probe = DeviceMediaProbe.forContext(context)

        shadowOf(power).setIsPowerSaveMode(false)
        val normal = probe.inputs().lowPower
        shadowOf(power).setIsPowerSaveMode(true)
        val saving = probe.inputs().lowPower
        shadowOf(power).setIsPowerSaveMode(false)
        val restored = probe.inputs().lowPower

        assertThat(listOf(normal, saving, restored)).containsExactly(false, true, false).inOrder()
    }

    @Test
    fun `avant Android 10 aucun etat thermique n est expose et rien ne baisse`() {
        val probe = DeviceMediaProbe.forContext(context)

        assertThat(probe.inputs().thermal).isEqualTo(DeviceThermalState.NOMINAL)
    }

    @Test
    fun `sans decodeur materiel annonce l appareil est range en bas`() {
        setMemory(totalMemBytes = 8 * gibibyte)
        val probe = DeviceMediaProbe.forContext(context)

        assertThat(probe.inputs().hwHevc).isFalse()
        assertThat(probe.inputs().hwAv1).isFalse()
        assertThat(probe.current()).isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `les cores et la cadence lus sont des mesures exploitables`() {
        val inputs = DeviceMediaProbe.forContext(context).inputs()

        assertThat(inputs.cores).isAtLeast(1)
        assertThat(inputs.maxFps).isAtLeast(DeviceMediaSignals.DEFAULT_FRAMES_PER_SECOND)
    }
}
