package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les seuils de mémoire et le mode faible RAM qui nourrissent la ligne « Profil média » de À propos. */
class DeviceMediaTierThresholdsTest {

    private fun inputs(
        memoryGb: Double?,
        lowPower: Boolean = false,
        cores: Int? = 8,
    ) = DeviceMediaInputs(
        memoryGb = memoryGb,
        cores = cores,
        maxFps = 60,
        hwAv1 = false,
        hwHevc = true,
        lowPower = lowPower,
        thermal = DeviceThermalState.NOMINAL,
    )

    @Test
    fun `sous 2,5 Gio l'appareil est Basique`() {
        assertThat(DeviceMediaTier.classify(inputs(memoryGb = 2.49))).isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `de 2,5 a moins de 3,5 Gio l'appareil est Intermediaire`() {
        assertThat(DeviceMediaTier.classify(inputs(memoryGb = 2.5))).isEqualTo(DeviceMediaTier.MID)
        assertThat(DeviceMediaTier.classify(inputs(memoryGb = 3.49))).isEqualTo(DeviceMediaTier.MID)
    }

    @Test
    fun `des 3,5 Gio et 4 coeurs l'appareil est Eleve`() {
        assertThat(DeviceMediaTier.classify(inputs(memoryGb = 3.5))).isEqualTo(DeviceMediaTier.HIGH)
    }

    @Test
    fun `un appareil declare a memoire comptee reste Basique quoi que rapporte la memoire totale`() {
        val memoryGb = DeviceMediaSignals.memoryGb(
            totalMemBytes = 8L * 1_073_741_824L,
            memoryClassMb = 256,
            isLowRamDevice = true,
        )
        assertThat(DeviceMediaTier.classify(inputs(memoryGb = memoryGb))).isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `l'economie d'energie plafonne un appareil Eleve a Intermediaire`() {
        assertThat(DeviceMediaTier.classify(inputs(memoryGb = 7.5, lowPower = true))).isEqualTo(DeviceMediaTier.MID)
    }

    @Test
    fun `la classification est deterministe`() {
        val reading = inputs(memoryGb = 3.7)
        assertThat(DeviceMediaTier.classify(reading)).isEqualTo(DeviceMediaTier.classify(reading))
    }
}
