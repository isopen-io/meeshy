package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performTextInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le texte d'une story s'écrit SUR la scène, dans l'objet lui-même (#12297), comme
 * `StoryInlineTextEditor` côté iOS : un objet posé ou touché devient un champ focalisé
 * (le clavier suit le focus), la frappe va dans l'objet, et un objet non sélectionné
 * n'est jamais éditable.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerInlineTextEditTest {

    @get:Rule
    val compose = createComposeRule()

    private val editable: SemanticsMatcher = hasSetTextAction()

    private fun setLayer(
        element: () -> StoryTextElement,
        selected: Boolean,
        onTextChange: (String) -> Unit = {},
    ) {
        compose.setContent {
            MeeshyTheme {
                TextElementLayer(
                    element = element(),
                    selected = selected,
                    menu = null,
                    canvasWidthPx = 720f,
                    canvasHeightPx = 1280f,
                    onTap = {},
                    onLongPress = {},
                    onMenuAction = {},
                    onMenuDismiss = {},
                    onDrag = { _, _ -> },
                    onDragEnd = {},
                    onTransform = { _, _ -> },
                    onRemove = {},
                    onTextChange = onTextChange,
                )
            }
        }
    }

    @Test
    fun `a selected text becomes a focused field on the scene`() {
        setLayer(element = { StoryTextElement(id = "t", text = "Bonjour") }, selected = true)

        compose.onNode(editable).assertIsFocused()
    }

    @Test
    fun `typing goes into the text object, after what it already says`() {
        var text by mutableStateOf("Bonjour")
        setLayer(
            element = { StoryTextElement(id = "t", text = text) },
            selected = true,
            onTextChange = { text = it },
        )

        compose.onNode(editable).performTextInput(" Meeshy")

        assertThat(text).isEqualTo("Bonjour Meeshy")
    }

    @Test
    fun `an unselected text is never editable`() {
        setLayer(element = { StoryTextElement(id = "t", text = "Bonjour") }, selected = false)

        compose.onNode(editable).assertDoesNotExist()
    }
}
