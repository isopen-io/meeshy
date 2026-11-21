package me.meeshy.app.game.ceremony

import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GloryAfterGain
import me.meeshy.sdk.model.game.GloryRank
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LE PAS VERS LE RANG SUIVANT (#19860, miroir de `MintCeremonyCopy.gloryStep` iOS) : sous la gloire gagnée, la scène dit
 * le nouveau nom quand la frappe franchit une marche, sinon la gloire qui manque jusqu'à la suivante — mêmes mots qu'iOS.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class MintCeremonyGloryStepComposeTest {

    @get:Rule val compose = createComposeRule()

    private fun said(step: GloryAfterGain): String {
        var text = ""
        compose.setContent { text = mintCeremonyGloryStep(step) }
        compose.waitForIdle()
        return text
    }

    @Test
    fun `une marche franchie dit le nouveau nom et sa division`() {
        assertThat(said(GloryAfterGain.Risen(GloryRank.Echo, 5))).isEqualTo("On t’appelle Écho V")
    }

    @Test
    fun `sans marche franchie, la gloire qui manque jusqu'au rang suivant`() {
        assertThat(said(GloryAfterGain.Toward(800, GloryRank.Murmure, 4))).isEqualTo("800 de gloire jusqu’à Murmure IV")
    }
}
