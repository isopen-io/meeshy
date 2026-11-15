package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.ui.component.export.ExportAnnouncer
import me.meeshy.ui.component.export.ExportAnnouncerHost
import me.meeshy.ui.component.export.LocalExportAnnouncer
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13897 — recette S8 du 2026-10-31 (23 h 50) : l'export a échoué (« Muxer error ») et la bande « Export en cours… ·
 * Annuler » a DISPARU sans un mot. Le chemin réel est : l'état passe de `Running` à `Failed`, l'hôte retient l'issue et
 * acquitte aussitôt (l'état revient à `Idle`) — et c'est l'issue retenue qui doit rester à l'écran, jamais un écran vide.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class SceneExportStatusComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `un export qui echoue en cours de rendu le dit, apres l acquittement`() {
        var state by mutableStateOf<SceneExportState>(SceneExportState.Running(0.6f, SceneExportDestination.GALLERY))
        var acknowledged = 0
        compose.setContent {
            SceneExportStatus(
                exportState = state,
                painting = null,
                onCancel = {},
                onRetry = {},
                onAcknowledge = {
                    acknowledged++
                    state = SceneExportState.Idle
                },
                onReady = {},
            )
        }
        compose.onNodeWithText("Cancel").assertExists()

        state = SceneExportState.Failed
        compose.waitForIdle()

        assertThat(acknowledged).isEqualTo(1)
        compose.onNodeWithText("Export failed. Try again.").assertExists()
        compose.onNodeWithText("Retry").assertExists()
    }

    @Test
    fun `un export enregistre le dit aussi, puis rend la main`() {
        var state by mutableStateOf<SceneExportState>(SceneExportState.Running(0.9f, SceneExportDestination.GALLERY))
        compose.setContent {
            SceneExportStatus(
                exportState = state,
                painting = null,
                onCancel = {},
                onRetry = {},
                onAcknowledge = { state = SceneExportState.Idle },
                onReady = {},
            )
        }

        state = SceneExportState.Saved
        compose.waitForIdle()

        compose.onNodeWithText("Saved to Photos").assertExists()
    }

    @Composable
    private fun Status(state: () -> SceneExportState, onRetry: () -> Unit = {}, onAcknowledge: () -> Unit = {}) {
        SceneExportStatus(
            exportState = state(),
            painting = null,
            onCancel = {},
            onRetry = onRetry,
            onAcknowledge = onAcknowledge,
            onReady = {},
        )
    }

    @Test
    fun `the composer announces its outcome through the application's announcer, which outlives it`() {
        val announcer = ExportAnnouncer()
        var state by mutableStateOf<SceneExportState>(SceneExportState.Running(0.9f, SceneExportDestination.GALLERY))
        var composerOpen by mutableStateOf(true)
        compose.setContent {
            CompositionLocalProvider(LocalExportAnnouncer provides announcer) {
                if (composerOpen) Status({ state }, onAcknowledge = { state = SceneExportState.Idle })
                ExportAnnouncerHost(announcer)
            }
        }

        state = SceneExportState.Saved
        compose.waitForIdle()
        assertThat(announcer.current?.message).isEqualTo("Saved to Photos")
        composerOpen = false
        compose.waitForIdle()

        compose.onNodeWithText("Saved to Photos").assertExists()
    }

    @Test
    fun `a shared export says so`() {
        var state by mutableStateOf<SceneExportState>(SceneExportState.Running(0.9f, SceneExportDestination.SHARE))
        compose.setContent { Status({ state }) }

        state = SceneExportState.Ready("/x.mp4", SceneExportDestination.SHARE)
        compose.waitForIdle()

        compose.onNodeWithText("Shared").assertExists()
    }

    @Test
    fun `retry relaunches the export and a running export outranks the previous outcome`() {
        var state by mutableStateOf<SceneExportState>(SceneExportState.Failed)
        var retries = 0
        compose.setContent { Status({ state }, onRetry = { retries++ }) }
        compose.onNodeWithText("Export failed. Try again.").assertExists()

        compose.onNodeWithText("Retry").performClick()
        state = SceneExportState.Running(0.2f, SceneExportDestination.GALLERY)
        compose.waitForIdle()

        assertThat(retries).isEqualTo(1)
        compose.onNodeWithText("Exporting…").assertExists()
        compose.onNodeWithText("Export failed. Try again.").assertDoesNotExist()
    }
}
