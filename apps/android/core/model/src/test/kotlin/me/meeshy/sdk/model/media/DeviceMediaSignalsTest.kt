package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le matériel que l'appareil déclare, avant normalisation : la sonde Android le
 * lit une fois, [DeviceMediaSignals.memoryGb] et [HardwareDecoderHeuristic] le
 * rendent NEUTRE pour la loi.
 */
class DeviceMediaSignalsTest {

    private val gibibyte = 1_073_741_824L

    @Test
    fun `la memoire rapportee est exprimee en Gio binaires`() {
        val gb = DeviceMediaSignals.memoryGb(
            totalMemBytes = 4 * gibibyte,
            memoryClassMb = 256,
            isLowRamDevice = false,
        )

        assertThat(gb).isEqualTo(4.0)
    }

    @Test
    fun `un telephone 4 Go qui rapporte 3,7 Gio reste haut`() {
        val gb = DeviceMediaSignals.memoryGb(
            totalMemBytes = (3.7 * gibibyte).toLong(),
            memoryClassMb = 256,
            isLowRamDevice = false,
        )

        assertThat(DeviceMediaTier.classify(inputsWith(gb))).isEqualTo(DeviceMediaTier.HIGH)
    }

    @Test
    fun `un appareil que le systeme declare a memoire comptee reste bas meme avec 3 Go rapportes`() {
        val gb = DeviceMediaSignals.memoryGb(
            totalMemBytes = 3 * gibibyte,
            memoryClassMb = 192,
            isLowRamDevice = true,
        )

        assertThat(gb).isAtMost(DeviceMediaSignals.LOW_RAM_CEILING_GB)
        assertThat(DeviceMediaTier.classify(inputsWith(gb))).isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `un appareil low ram a 1 Go ne remonte pas au plafond`() {
        val gb = DeviceMediaSignals.memoryGb(
            totalMemBytes = 1 * gibibyte,
            memoryClassMb = 128,
            isLowRamDevice = true,
        )

        assertThat(gb).isEqualTo(1.0)
    }

    @Test
    fun `un tas applicatif minuscule trahit un appareil a memoire comptee`() {
        val gb = DeviceMediaSignals.memoryGb(
            totalMemBytes = 4 * gibibyte,
            memoryClassMb = 64,
            isLowRamDevice = false,
        )

        assertThat(gb).isAtMost(DeviceMediaSignals.LOW_RAM_CEILING_GB)
    }

    @Test
    fun `une memoire totale illisible est inconnue et ne baisse rien`() {
        val gb = DeviceMediaSignals.memoryGb(
            totalMemBytes = 0,
            memoryClassMb = 256,
            isLowRamDevice = false,
        )

        assertThat(gb).isNull()
    }

    @Test
    fun `une memoire totale illisible sur un appareil low ram reste plafonnee`() {
        val gb = DeviceMediaSignals.memoryGb(
            totalMemBytes = 0,
            memoryClassMb = 128,
            isLowRamDevice = true,
        )

        assertThat(gb).isEqualTo(DeviceMediaSignals.LOW_RAM_CEILING_GB)
    }

    @Test
    fun `la cadence arrondit une frequence legerement fausse`() {
        assertThat(DeviceMediaSignals.framesPerSecond(119.88f)).isEqualTo(120)
        assertThat(DeviceMediaSignals.framesPerSecond(60.0f)).isEqualTo(60)
        assertThat(DeviceMediaSignals.framesPerSecond(90.0f)).isEqualTo(90)
    }

    @Test
    fun `une cadence illisible vaut 60 Hz`() {
        assertThat(DeviceMediaSignals.framesPerSecond(0f)).isEqualTo(60)
        assertThat(DeviceMediaSignals.framesPerSecond(Float.NaN)).isEqualTo(60)
        assertThat(DeviceMediaSignals.framesPerSecond(-1f)).isEqualTo(60)
    }

    private fun inputsWith(memoryGb: Double?) = DeviceMediaSignals(
        memoryGb = memoryGb,
        cores = 8,
        maxFps = 60,
        hwHevc = true,
        hwAv1 = false,
    ).inputs(lowPower = false, thermal = DeviceThermalState.NOMINAL)
}
