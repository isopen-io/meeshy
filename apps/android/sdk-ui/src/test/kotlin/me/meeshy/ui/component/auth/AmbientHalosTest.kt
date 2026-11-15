package me.meeshy.ui.component.auth

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.State
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les halos ambiants pulsent deux secondes en va-et-vient — sauf sous « Réduire les animations »
 * ([LocalReduceMotion] : le réglage de l'app ou l'échelle système à zéro, résolus une fois) : alors
 * AUCUNE transition infinie n'est créée, le décor reste à son échelle de repos.
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

    private fun observeHaloPhase(reduceMotion: Boolean): State<Float> {
        compose.mainClock.autoAdvance = false
        lateinit var phase: State<Float>
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                phase = rememberHaloPhase()
            }
        }
        compose.mainClock.advanceTimeBy(100)
        return phase
    }

    @Test
    fun `with animations at normal speed the halos breathe`() {
        val phase = observeHaloPhase(reduceMotion = false)

        compose.mainClock.advanceTimeBy(1_000)

        assertThat(phase.value).isGreaterThan(0f)
    }

    @Test
    fun `under reduced motion the halos never leave their rest scale`() {
        val phase = observeHaloPhase(reduceMotion = true)

        compose.mainClock.advanceTimeBy(1_000)
        compose.mainClock.advanceTimeBy(1_000)

        assertThat(phase.value).isEqualTo(0f)
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
