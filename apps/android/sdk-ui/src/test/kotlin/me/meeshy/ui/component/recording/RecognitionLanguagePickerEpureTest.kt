package me.meeshy.ui.component.recording

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LanguageData
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le choix de la langue de l'audio nomme son interrupteur (« Show all languages ») et range l'explication
 * « seules les langues installées sont listées » derrière un (i) dont le nom est la QUESTION (#18099, épure
 * #17584, règle 1). La note reste lue par le lecteur d'écran, même repliée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RecognitionLanguagePickerEpureTest {
    @get:Rule val compose = createComposeRule()

    private val spanish = LanguageData.info("es")!!.nativeName.replaceFirstChar { it.titlecase() }
    private val question = "Why so few languages?"
    private val note = "By default, only languages available on this device are listed."

    private fun show() = compose.setContent {
        MeeshyTheme { RecognitionLanguagePickerContent(setOf("fr-FR", "en-US"), "fr", {}, Color(0xFF6366F1)) }
    }

    @Test
    fun `au repos le libelle nomme l interrupteur et l explication n est pas affichee`() {
        show()
        compose.onNodeWithText("Show all languages").assertIsDisplayed()
        compose.onNodeWithText(note).assertDoesNotExist()
    }

    @Test
    fun `le i porte la question pour nom, une cible de 48 dp et la note pour etat`() {
        show()
        val info = compose.onNodeWithContentDescription(question)
        info.assertIsDisplayed().assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        assertThat(info.fetchSemanticsNode().config[SemanticsProperties.StateDescription]).isEqualTo(note)
    }

    @Test
    fun `toucher le i deplie la note sans basculer l interrupteur`() {
        show()
        compose.onNodeWithContentDescription(question).performClick()
        compose.onNodeWithText(note).assertIsDisplayed().assertTextEquals(note)
        compose.onNodeWithText(spanish).assertDoesNotExist()
    }
}
