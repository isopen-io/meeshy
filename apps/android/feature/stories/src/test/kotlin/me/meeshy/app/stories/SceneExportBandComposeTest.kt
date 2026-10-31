package me.meeshy.app.stories

import android.view.View
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.ui.theme.MeeshySpacing
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13897 — l'export se suit dans un BANDEAU qui ne bloque rien, comme sur le web : sa progression et « Annuler », posés en
 * bas, dans une fenêtre qui ne prend ni le focus ni les gestes de l'écran. Aucune fenêtre modale ; la scène qu'on peint
 * voyage avec le bandeau, invisible.
 *
 * #13951 — le bandeau se tient AU-DESSUS de la barre de navigation système (à boutons comme à gestes), et la fin de l'export
 * s'y annonce : « Enregistré », « Partagé », ou l'échec avec « Réessayer », lus par TalkBack.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class SceneExportBandComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a running export shows a band with its progress and cancel, never a modal window`() {
        var cancels = 0
        compose.setContent { SceneExportBand(fraction = 0.4f, onCancel = { cancels++ }) }

        compose.onNodeWithText("Exporting…").assertExists()
        compose.onAllNodes(isDialog()).assertCountEquals(0)
        compose.onAllNodes(isPopup()).assertCountEquals(1)
        compose.onNodeWithText("Cancel").performClick()

        assertThat(cancels).isEqualTo(1)
    }

    @Test
    fun `the scene being painted travels with the band`() {
        compose.setContent {
            SceneExportBand(fraction = 0f, onCancel = {}, painting = { Box(Modifier.testTag("peintre")) })
        }

        compose.onNodeWithTag("peintre").assertExists()
        compose.onAllNodes(isDialog()).assertCountEquals(0)
    }

    @Test
    fun `no export, no band`() {
        compose.setContent { SceneExportBand(fraction = null, onCancel = {}) }

        compose.onAllNodes(isPopup()).assertCountEquals(0)
        compose.onNodeWithText("Exporting…").assertDoesNotExist()
    }

    @Test
    fun `the band stands above a three-button navigation bar`() {
        assertBandClearsNavigationBar(navigationBar = 48.dp) { SceneExportBand(fraction = 0.4f, onCancel = {}) }
    }

    @Test
    fun `the band stands above a gesture navigation handle`() {
        assertBandClearsNavigationBar(navigationBar = 16.dp) { SceneExportBand(fraction = 0.4f, onCancel = {}) }
    }

    @Test
    fun `the outcome stands above the navigation bar too`() {
        assertBandClearsNavigationBar(navigationBar = 48.dp) {
            SceneExportBand(fraction = null, onCancel = {}, outcome = SceneExportOutcome.SAVED)
        }
    }

    @Test
    fun `a saved export says so, politely announced, then leaves`() {
        var shown = 0
        compose.mainClock.autoAdvance = false
        compose.setContent {
            SceneExportBand(fraction = null, onCancel = {}, outcome = SceneExportOutcome.SAVED, onOutcomeShown = { shown++ })
        }
        compose.mainClock.advanceTimeByFrame()

        compose.onNodeWithText("Saved to Photos").assertExists()
        compose.onNode(announced(LiveRegionMode.Polite)).assertExists()
        compose.onNodeWithText("Cancel").assertDoesNotExist()
        compose.onNodeWithText("Retry").assertDoesNotExist()
        assertThat(shown).isEqualTo(0)

        compose.mainClock.advanceTimeBy(SceneExportBandTiming.OUTCOME_MILLIS + 100)

        assertThat(shown).isEqualTo(1)
    }

    @Test
    fun `a shared export says so`() {
        compose.setContent { SceneExportBand(fraction = null, onCancel = {}, outcome = SceneExportOutcome.SHARED) }

        compose.onNodeWithText("Shared").assertExists()
        compose.onNode(announced(LiveRegionMode.Polite)).assertExists()
    }

    @Test
    fun `a failed export says so assertively and offers to retry`() {
        var retries = 0
        compose.setContent {
            SceneExportBand(fraction = null, onCancel = {}, outcome = SceneExportOutcome.FAILED, onRetry = { retries++ })
        }

        compose.onNodeWithText("Export failed. Try again.").assertExists()
        compose.onNode(announced(LiveRegionMode.Assertive)).assertExists()
        compose.onNodeWithText("Retry").performClick()

        assertThat(retries).isEqualTo(1)
    }

    @Test
    fun `a running export outranks the previous outcome`() {
        compose.setContent { SceneExportBand(fraction = 0.2f, onCancel = {}, outcome = SceneExportOutcome.FAILED) }

        compose.onNodeWithText("Exporting…").assertExists()
        compose.onNodeWithText("Export failed. Try again.").assertDoesNotExist()
        compose.onAllNodes(isPopup()).assertCountEquals(1)
    }

    @Test
    fun `each end of the export has its outcome`() {
        val share = SceneExportDestination.SHARE
        assertThat(SceneExportOutcome.of(SceneExportState.Saved)).isEqualTo(SceneExportOutcome.SAVED)
        assertThat(SceneExportOutcome.of(SceneExportState.Ready("/x.mp4", share))).isEqualTo(SceneExportOutcome.SHARED)
        assertThat(SceneExportOutcome.of(SceneExportState.Failed)).isEqualTo(SceneExportOutcome.FAILED)
        assertThat(SceneExportOutcome.of(SceneExportState.Running(0.5f, share))).isNull()
        assertThat(SceneExportOutcome.of(SceneExportState.Idle)).isNull()
    }

    private fun announced(mode: LiveRegionMode) = SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, mode)

    /**
     * La fenêtre du bandeau ne reçoit pas les encarts de l'écran : seuls ceux de l'hôte disent où passe la barre de
     * navigation. Le bandeau doit laisser au moins sa hauteur, plus sa marge, sous sa surface.
     */
    private fun assertBandClearsNavigationBar(navigationBar: Dp, band: @androidx.compose.runtime.Composable () -> Unit) {
        lateinit var host: View
        compose.setContent {
            host = LocalView.current
            Box(Modifier.fillMaxSize()) { band() }
        }
        compose.runOnIdle {
            val pixels = (navigationBar.value * host.resources.displayMetrics.density).toInt()
            val insets = WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, pixels))
                .build()
            ViewCompat.dispatchApplyWindowInsets(host, insets)
        }
        compose.waitForIdle()

        val window = compose.onNode(isPopup()).getUnclippedBoundsInRoot()
        val surface = compose.onNodeWithTag(SCENE_EXPORT_BAND_TAG).getUnclippedBoundsInRoot()

        assertThat((window.bottom - surface.bottom).value).isAtLeast((navigationBar + MeeshySpacing.md).value)
    }
}
