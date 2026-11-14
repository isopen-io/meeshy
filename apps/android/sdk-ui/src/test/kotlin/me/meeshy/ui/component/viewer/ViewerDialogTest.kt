package me.meeshy.ui.component.viewer

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** P18.8 — la pastille de l'appel réduit reste posée au-dessus d'une visionneuse, qui est une fenêtre à part. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class ViewerDialogTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(overlay: (@Composable () -> Unit)?) {
        compose.setContent {
            CompositionLocalProvider(LocalViewerTopOverlay provides overlay) {
                ViewerDialog(onDismissRequest = {}, properties = viewerDialogProperties(secure = false)) {
                    Text("visionneuse")
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the overlay of the host is drawn inside the viewer window`() {
        show(overlay = { Text("pastille d'appel") })

        compose.onNodeWithText("visionneuse").assertExists()
        compose.onNodeWithText("pastille d'appel").assertExists()
    }

    @Test
    fun `without an overlay the viewer shows only itself`() {
        show(overlay = null)

        compose.onNodeWithText("visionneuse").assertExists()
        compose.onNodeWithText("pastille d'appel").assertDoesNotExist()
    }

    @Test
    fun `the viewer sits below the call pill, so its close button is never covered`() {
        show(overlay = { Text("pastille d'appel") })

        val pill = compose.onNodeWithText("pastille d'appel").getUnclippedBoundsInRoot()
        val viewer = compose.onNodeWithText("visionneuse").getUnclippedBoundsInRoot()
        assertThat(viewer.top.value).isAtLeast(pill.bottom.value)
    }
}
