package me.meeshy.app.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowToast

/**
 * #18975, audit de #19077 P10 — l'avis d'un envoi chiffré qui n'a pas pu partir se dit UNE fois : ni une recomposition, ni
 * l'écran recréé (rotation, retour au fil) ne le rejouent.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EndToEndSendRefusalEffectTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a refused encrypted send is announced once, and never again when the screen comes back`() {
        ShadowToast.reset()
        val restoration = StateRestorationTester(compose)
        var refusals by mutableIntStateOf(0)
        restoration.setContent { EndToEndSendRefusalEffect(refusals) }
        compose.waitForIdle()
        assertThat(ShadowToast.shownToastCount()).isEqualTo(0)

        compose.runOnIdle { refusals = 1 }
        compose.waitForIdle()
        assertThat(ShadowToast.shownToastCount()).isEqualTo(1)

        restoration.emulateSavedInstanceStateRestore()
        compose.waitForIdle()
        assertThat(ShadowToast.shownToastCount()).isEqualTo(1)
    }
}
