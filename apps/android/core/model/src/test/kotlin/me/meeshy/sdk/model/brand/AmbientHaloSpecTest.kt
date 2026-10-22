package me.meeshy.sdk.model.brand

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Les halos ambiants des écrans d'accès (iOS `ThemePalette.ambientOrbs` + le pouls
 * `glowPulse` de `LoginView`) : quatre disques de la famille indigo, deux fois plus
 * présents en sombre, qui respirent entre deux échelles en deux secondes.
 */
class AmbientHaloSpecTest {

    @Test
    fun `there are four halos in the indigo family, in the iOS draw order`() {
        val halos = AmbientHaloSpec.halos(isDark = false)

        assertThat(halos.map { it.tone }).containsExactly(
            AmbientHaloTone.INDIGO_500,
            AmbientHaloTone.INDIGO_700,
            AmbientHaloTone.INDIGO_400,
            AmbientHaloTone.INDIGO_300,
        ).inOrder()
        assertThat(halos.map { it.sizeDp }).containsExactly(300f, 350f, 250f, 200f).inOrder()
    }

    @Test
    fun `the dark theme doubles the presence of the light one`() {
        val light = AmbientHaloSpec.halos(isDark = false).map { it.alpha }
        val dark = AmbientHaloSpec.halos(isDark = true).map { it.alpha }

        assertThat(light).containsExactly(0.05f, 0.05f, 0.04f, 0.03f).inOrder()
        assertThat(dark).containsExactly(0.10f, 0.10f, 0.08f, 0.06f).inOrder()
    }

    @Test
    fun `each halo sits at its own offset from the centre`() {
        val halos = AmbientHaloSpec.halos(isDark = true)

        assertThat(halos.map { it.offsetXDp }).containsExactly(-100f, 150f, 100f, -150f).inOrder()
        assertThat(halos.map { it.offsetYDp }).containsExactly(-200f, 300f, -100f, 200f).inOrder()
    }

    @Test
    fun `the scale breathes between a shrunk and a swollen halo, a little less for each rank`() {
        assertThat(AmbientHaloSpec.scale(index = 0, phase = 0f)).isWithin(1e-6f).of(0.80f)
        assertThat(AmbientHaloSpec.scale(index = 0, phase = 1f)).isWithin(1e-6f).of(1.30f)
        assertThat(AmbientHaloSpec.scale(index = 2, phase = 0f)).isWithin(1e-6f).of(0.90f)
        assertThat(AmbientHaloSpec.scale(index = 2, phase = 1f)).isWithin(1e-6f).of(1.20f)
    }

    @Test
    fun `the phase is clamped so an overshooting spring never inverts a halo`() {
        assertThat(AmbientHaloSpec.scale(index = 1, phase = -3f)).isEqualTo(AmbientHaloSpec.scale(index = 1, phase = 0f))
        assertThat(AmbientHaloSpec.scale(index = 1, phase = 9f)).isEqualTo(AmbientHaloSpec.scale(index = 1, phase = 1f))
    }

    @Test
    fun `the pulse lasts two seconds each way`() {
        assertThat(AmbientHaloSpec.PULSE_DURATION_MILLIS).isEqualTo(2000)
    }
}
