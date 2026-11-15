package me.meeshy.ui.component.recording

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.hasSetTextAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LanguageData
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RecognitionLanguagePickerTest {
    @get:Rule val compose = createComposeRule()

    private val accent = Color(0xFF6366F1)
    private val french = LanguageData.info("fr")!!.nativeName.replaceFirstChar { it.titlecase() }
    private val spanish = LanguageData.info("es")!!.nativeName.replaceFirstChar { it.titlecase() }

    private fun show(selected: String = "fr", onSelect: (String) -> Unit = {}) = compose.setContent {
        RecognitionLanguagePickerContent(setOf("fr-FR", "en-US"), selected, onSelect, accent)
    }

    @Test
    fun `par defaut seules les langues installees sont listees`() {
        show()
        compose.onNodeWithText(french).assertIsDisplayed()
        compose.onNodeWithText(spanish).assertDoesNotExist()
    }

    @Test
    fun `la bascule affiche toutes les langues`() {
        show()
        compose.onNodeWithText("Show all languages").performClick()
        compose.onNodeWithText(spanish).assertIsDisplayed()
    }

    @Test
    fun `la recherche filtre la liste`() {
        show()
        compose.onNodeWithText("Show all languages").performClick()
        compose.onNode(hasSetTextAction()).performTextInput("espa")
        compose.onNodeWithText(spanish).assertIsDisplayed()
        compose.onNodeWithText(french).assertDoesNotExist()
    }

    @Test
    fun `la langue choisie est cochee et toucher une langue la rend`() {
        val picked = mutableListOf<String>()
        show(selected = "fr", onSelect = { picked += it })
        compose.onNodeWithText(french).assertIsSelected()
        compose.onNodeWithText(french).performClick()
        assertThat(picked).containsExactly("fr")
    }
}
