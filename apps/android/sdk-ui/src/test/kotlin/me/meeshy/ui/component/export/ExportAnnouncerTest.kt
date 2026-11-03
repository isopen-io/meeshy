package me.meeshy.ui.component.export

import android.view.View
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
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
import me.meeshy.ui.theme.MeeshySpacing
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14557 — UN annonceur d'export, posé au niveau de l'application : ce qu'une feuille annonce en se fermant (« Imager »)
 * reste à l'écran après elle, dans le MÊME bandeau que le compositeur (#13951) — au-dessus de la barre de navigation, lu
 * par TalkBack, l'échec avec « Réessayer » — puis rend la main.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class ExportAnnouncerTest {

    @get:Rule
    val compose = createComposeRule()

    private fun announced(mode: LiveRegionMode) = SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, mode)

    @Composable
    private fun App(announcer: ExportAnnouncer, content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalExportAnnouncer provides announcer) {
            Box(Modifier.fillMaxSize()) { content() }
            ExportAnnouncerHost(announcer)
        }
    }

    @Test
    fun `what a closing sheet announces outlives the sheet, politely, then leaves`() {
        val announcer = ExportAnnouncer()
        var sheetOpen by mutableStateOf(true)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            App(announcer) {
                if (sheetOpen) {
                    val local = rememberExportAnnouncer()
                    LaunchedEffect(Unit) {
                        local.announce(ExportAnnouncement("Image enregistrée dans la galerie"))
                        sheetOpen = false
                    }
                }
            }
        }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()

        assertThat(sheetOpen).isFalse()
        compose.onNodeWithText("Image enregistrée dans la galerie").assertExists()
        compose.onNode(announced(LiveRegionMode.Polite)).assertExists()

        compose.mainClock.advanceTimeBy(ExportBandTiming.OUTCOME_MILLIS + 100)

        compose.onNodeWithText("Image enregistrée dans la galerie").assertDoesNotExist()
        assertThat(announcer.current).isNull()
    }

    @Test
    fun `a failure is announced assertively and offers to retry`() {
        val announcer = ExportAnnouncer()
        var retries = 0
        compose.setContent { App(announcer) {} }
        announcer.announce(ExportAnnouncement("Export failed. Try again.", failed = true, retryLabel = "Retry", onRetry = { retries++ }))
        compose.waitForIdle()

        compose.onNode(announced(LiveRegionMode.Assertive)).assertExists()
        compose.onNodeWithText("Retry").performClick()
        compose.waitForIdle()

        assertThat(retries).isEqualTo(1)
        compose.onNodeWithText("Export failed. Try again.").assertDoesNotExist()
    }

    @Test
    fun `an announcer withdraws only its own announcement`() {
        val announcer = ExportAnnouncer()
        val mine = ExportAnnouncement("Saved")
        val other = ExportAnnouncement("Shared")
        announcer.announce(mine)
        announcer.announce(other)

        announcer.withdraw(mine)
        assertThat(announcer.current).isSameInstanceAs(other)
        announcer.withdraw(other)
        assertThat(announcer.current).isNull()
    }

    @Test
    fun `the application's announcer is the one a screen gets`() {
        val announcer = ExportAnnouncer()
        lateinit var got: ExportAnnouncer
        compose.setContent { App(announcer) { got = rememberExportAnnouncer() } }

        assertThat(got).isSameInstanceAs(announcer)
    }

    @Test
    fun `without an application announcer, a screen still has one of its own`() {
        compose.setContent {
            val local = rememberExportAnnouncer()
            LaunchedEffect(Unit) { local.announce(ExportAnnouncement("Shared")) }
        }

        compose.onNodeWithText("Shared").assertExists()
    }

    @Test
    fun `nothing announced, no window`() {
        compose.setContent { App(ExportAnnouncer()) {} }

        compose.onAllNodes(isPopup()).assertCountEquals(0)
    }

    @Test
    fun `the announcement stands above a three-button navigation bar`() {
        assertClearsNavigationBar(48.dp)
    }

    @Test
    fun `the announcement stands above a gesture navigation handle`() {
        assertClearsNavigationBar(16.dp)
    }

    private fun assertClearsNavigationBar(navigationBar: Dp) {
        val announcer = ExportAnnouncer()
        lateinit var host: View
        compose.setContent {
            host = LocalView.current
            App(announcer) {}
        }
        announcer.announce(ExportAnnouncement("Saved"))
        compose.runOnIdle {
            val pixels = (navigationBar.value * host.resources.displayMetrics.density).toInt()
            val insets = WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, pixels))
                .build()
            ViewCompat.dispatchApplyWindowInsets(host, insets)
        }
        compose.waitForIdle()

        val window = compose.onNode(isPopup()).getUnclippedBoundsInRoot()
        val surface = compose.onNodeWithTag(EXPORT_BAND_TAG).getUnclippedBoundsInRoot()

        assertThat((window.bottom - surface.bottom).value).isAtLeast((navigationBar + MeeshySpacing.md).value)
    }
}
