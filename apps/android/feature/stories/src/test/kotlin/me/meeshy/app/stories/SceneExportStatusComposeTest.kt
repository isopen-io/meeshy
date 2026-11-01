package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportState
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
}
