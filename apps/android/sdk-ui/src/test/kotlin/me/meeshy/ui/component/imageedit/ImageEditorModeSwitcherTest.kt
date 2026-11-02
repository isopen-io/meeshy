package me.meeshy.ui.component.imageedit

import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.EditorTool
import me.meeshy.sdk.model.imageedit.ImageEditorMode
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w400dp-h800dp-mdpi")
class ImageEditorModeSwitcherTest {
    @get:Rule val compose = createComposeRule()

    @Test fun `la capsule annonce le segment actif et relaie le choix`() {
        val chosen = mutableListOf<ImageEditorMode>()
        compose.setContent {
            ImageEditorModeSwitcher(mode = ImageEditorMode.SIMPLE, isDark = false, onSelect = { chosen += it })
        }
        compose.onNodeWithContentDescription("Simple mode").assertIsSelected()
        compose.onNodeWithContentDescription("Pro mode").performClick()
        assertThat(chosen).containsExactly(ImageEditorMode.PRO)
    }

    @Test fun `repasser en Simple depuis Effets ferme l'outil et retire Effets du rail`() {
        val h = ImageEditorScreenHarness(compose, ImageEditorMode.PRO)
        h.show()
        compose.onNodeWithTag("image-editor-fab-${EditorTool.EFFECTS.name}").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("image-editor-chip-${EditorTool.EFFECTS.name}").assertExists()

        compose.onNodeWithContentDescription("Simple mode").performClick()
        compose.waitForIdle()

        compose.onNodeWithTag("image-editor-controller").assertDoesNotExist()
        compose.onNodeWithTag("image-editor-fab-${EditorTool.EFFECTS.name}").assertDoesNotExist()
        compose.onNodeWithTag("image-editor-fab-${EditorTool.FILTERS.name}").assertExists()
        assertThat(h.store.mode).isEqualTo(ImageEditorMode.SIMPLE)
    }
}
