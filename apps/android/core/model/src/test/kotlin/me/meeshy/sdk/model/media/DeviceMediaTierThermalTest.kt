package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La chaleur et l'économie d'énergie bougent pendant la vie du processus : un
 * appareil qui chauffe descend en `LOW` sans relancer l'app, et remonte en
 * refroidissant. Le matériel, lui, ne change pas — il est figé dans
 * [DeviceMediaSignals], et seules ces deux entrées se relisent.
 */
class DeviceMediaTierThermalTest {

    private fun flagship() = DeviceMediaSignals(
        memoryGb = 7.5,
        cores = 8,
        maxFps = 120,
        hwHevc = true,
        hwAv1 = true,
    )

    private fun tier(
        signals: DeviceMediaSignals = flagship(),
        lowPower: Boolean = false,
        thermal: DeviceThermalState = DeviceThermalState.NOMINAL,
    ) = DeviceMediaTier.classify(signals.inputs(lowPower = lowPower, thermal = thermal))

    @Test
    fun `une chaleur serious rend bas`() {
        assertThat(tier(thermal = DeviceThermalState.SERIOUS)).isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `une chaleur critical rend bas`() {
        assertThat(tier(thermal = DeviceThermalState.CRITICAL)).isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `une chaleur fair ne change rien`() {
        assertThat(tier(thermal = DeviceThermalState.FAIR)).isEqualTo(DeviceMediaTier.PRO)
    }

    @Test
    fun `l appareil descend en bas en chauffant puis remonte en refroidissant`() {
        val trajectory = listOf(
            DeviceThermalState.NOMINAL,
            DeviceThermalState.FAIR,
            DeviceThermalState.SERIOUS,
            DeviceThermalState.CRITICAL,
            DeviceThermalState.SERIOUS,
            DeviceThermalState.FAIR,
            DeviceThermalState.NOMINAL,
        )

        val tiers = trajectory.map { tier(thermal = it) }

        assertThat(tiers).containsExactly(
            DeviceMediaTier.PRO,
            DeviceMediaTier.PRO,
            DeviceMediaTier.LOW,
            DeviceMediaTier.LOW,
            DeviceMediaTier.LOW,
            DeviceMediaTier.PRO,
            DeviceMediaTier.PRO,
        ).inOrder()
    }

    @Test
    fun `la chaleur l emporte sur l economie d energie`() {
        assertThat(tier(lowPower = true, thermal = DeviceThermalState.SERIOUS))
            .isEqualTo(DeviceMediaTier.LOW)
        assertThat(tier(lowPower = true, thermal = DeviceThermalState.NOMINAL))
            .isEqualTo(DeviceMediaTier.MID)
    }

    @Test
    fun `la chaleur baisse aussi un appareil dont la memoire est inconnue`() {
        val unknown = DeviceMediaSignals(
            memoryGb = null,
            cores = null,
            maxFps = 60,
            hwHevc = true,
            hwAv1 = false,
        )

        assertThat(tier(unknown)).isEqualTo(DeviceMediaTier.HIGH)
        assertThat(tier(unknown, thermal = DeviceThermalState.SERIOUS)).isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `un compte de coeurs nul n est pas une mesure`() {
        val zeroCores = flagship().copy(cores = 0)

        assertThat(zeroCores.inputs(lowPower = false, thermal = DeviceThermalState.NOMINAL).cores).isNull()
        assertThat(tier(zeroCores)).isEqualTo(DeviceMediaTier.PRO)
    }
}
