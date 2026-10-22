package me.meeshy.ui.component.auth

import android.provider.Settings
import androidx.compose.runtime.State
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les halos ambiants pulsent deux secondes en va-et-vient — sauf quand le système demande de
 * réduire les animations (facteur de durée des animations à zéro) : alors AUCUNE transition
 * infinie n'est créée, le décor reste à son échelle de repos.
 *
 * L'horloge de test est mise en pause (`autoAdvance = false`) : c'est ce qui laisse tourner
 * une animation infinie, que le moteur de test annule sinon. Un halo qui pulserait malgré le
 * réglage avancerait donc, et le témoin tomberait.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AmbientHalosTest {

    @get:Rule
    val compose = createComposeRule()

    private fun observeHaloPhase(animatorDurationScale: Float): State<Float> {
        compose.mainClock.autoAdvance = false
        lateinit var phase: State<Float>
        compose.setContent {
            Settings.Global.putString(
                LocalContext.current.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                animatorDurationScale.toString(),
            )
            phase = rememberHaloPhase()
        }
        compose.mainClock.advanceTimeBy(100)
        return phase
    }

    @Test
    fun `with animations at normal speed the halos breathe`() {
        val phase = observeHaloPhase(animatorDurationScale = 1f)

        compose.mainClock.advanceTimeBy(1_000)

        assertThat(phase.value).isGreaterThan(0f)
    }

    @Test
    fun `with the system animator scale at zero the halos never leave their rest scale`() {
        val phase = observeHaloPhase(animatorDurationScale = 0f)

        compose.mainClock.advanceTimeBy(1_000)
        compose.mainClock.advanceTimeBy(1_000)

        assertThat(phase.value).isEqualTo(0f)
    }

    @Test
    fun `the zero scale is the only one that counts as reduced motion`() {
        assertThat(animationsReducedBy(0f)).isTrue()
        assertThat(animationsReducedBy(0.5f)).isFalse()
        assertThat(animationsReducedBy(1f)).isFalse()
        assertThat(animationsReducedBy(10f)).isFalse()
    }

    @Test
    fun `the halos draw under the light theme without a pulse`() {
        compose.setContent { MeeshyTheme(darkTheme = false) { AmbientHalos(reduceMotion = true) } }

        compose.waitForIdle()
        compose.onRoot().assertExists()
    }

    @Test
    fun `the halos draw under the dark theme with the pulse running`() {
        compose.mainClock.autoAdvance = false
        compose.setContent { MeeshyTheme(darkTheme = true) { AmbientHalos(reduceMotion = false) } }

        compose.mainClock.advanceTimeBy(500)

        compose.onRoot().assertExists()
    }
}
