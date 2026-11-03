package me.meeshy.ui.component.imageedit

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.EditorTool
import me.meeshy.sdk.model.imageedit.ImageEditorMode
import me.meeshy.sdk.model.imageedit.ImageFilter
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w400dp-h800dp-mdpi")
class MeeshyImageEditorScreenSemanticsTest {
    @get:Rule val compose = createComposeRule()

    private fun fab(tool: EditorTool) = compose.onNodeWithTag("image-editor-fab-${tool.name}")

    @Test fun `le rail Simple nomme Recadrer Filtres Ajuster et garde Effets pour Pro`() {
        ImageEditorScreenHarness(compose).show()
        compose.onNodeWithContentDescription("Crop").assertExists()
        compose.onNodeWithContentDescription("Filters").assertExists()
        compose.onNodeWithContentDescription("Adjust").assertExists()
        compose.onNodeWithContentDescription("Effects").assertDoesNotExist()
        compose.onNodeWithContentDescription("Cancel").assertExists()
        compose.onNodeWithContentDescription("Done").assertExists()
    }

    @Test fun `le rail Pro ajoute Effets`() {
        ImageEditorScreenHarness(compose, ImageEditorMode.PRO).show()
        compose.onNodeWithContentDescription("Effects").assertExists()
    }

    @Test fun `annuler et retablir sont nommes et desactives sans retouche`() {
        ImageEditorScreenHarness(compose).show()
        compose.onNodeWithContentDescription("Undo change").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Redo").assertIsNotEnabled()
        compose.onNodeWithContentDescription("History").assertDoesNotExist()
    }

    @Test fun `les FAB disparaissent quand un controleur est ouvert`() {
        ImageEditorScreenHarness(compose).show()
        fab(EditorTool.FILTERS).performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("image-editor-controller").assertExists()
        fab(EditorTool.CROP).assertDoesNotExist()
        compose.onNodeWithTag("image-editor-fab-undo").assertDoesNotExist()
        compose.onNodeWithTag("image-editor-chip-${EditorTool.FILTERS.name}").assertExists()
    }

    @Test fun `le panneau Recadrer nomme les pivots et reserve les miroirs a Pro`() {
        ImageEditorScreenHarness(compose).show()
        fab(EditorTool.CROP).performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Rotate left").assertExists()
        compose.onNodeWithContentDescription("Rotate right").assertExists()
        compose.onNodeWithContentDescription("Flip horizontally").assertDoesNotExist()
    }

    @Test fun `Pro offre les miroirs horizontal et vertical`() {
        ImageEditorScreenHarness(compose, ImageEditorMode.PRO).show()
        fab(EditorTool.CROP).performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Flip horizontally").assertExists()
        compose.onNodeWithContentDescription("Flip vertically").assertExists()
    }

    @Test fun `une retouche fait apparaitre l'historique et le badge Original pendant la comparaison`() {
        val h = ImageEditorScreenHarness(compose)
        h.show()
        h.send(ImageEditorUiEvent.SelectFilter(ImageFilter.SEPIA))
        compose.waitForIdle()
        compose.onNodeWithContentDescription("History").assertExists()
        compose.onNodeWithTag("image-editor-before-badge").assertDoesNotExist()
        h.send(ImageEditorUiEvent.BeginCompare)
        compose.waitForIdle()
        compose.onNodeWithTag("image-editor-before-badge").assertExists()
        h.send(ImageEditorUiEvent.EndCompare)
        compose.waitForIdle()
        compose.onNodeWithTag("image-editor-before-badge").assertDoesNotExist()
    }

    @Test fun `Termine rend l'image une fois et la remet a l'appelant`() {
        val h = ImageEditorScreenHarness(compose)
        h.show()
        compose.onNodeWithContentDescription("Done").performClick()
        compose.waitForIdle()
        assertThat(h.accepted).hasSize(1)
        assertThat(h.renderer.renders).hasSize(1)
    }

    @Test fun `Annuler quitte sans rendu`() {
        val h = ImageEditorScreenHarness(compose)
        h.show()
        compose.onNodeWithContentDescription("Cancel").performClick()
        compose.waitForIdle()
        assertThat(h.cancels).isEqualTo(1)
        assertThat(h.renderer.renders).isEmpty()
    }
}
