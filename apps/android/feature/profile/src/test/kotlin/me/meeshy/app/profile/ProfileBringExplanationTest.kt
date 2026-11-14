package me.meeshy.app.profile

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Le Bring est un repère propre à Meeshy (règle 7 de l'épure #17584, #18099) : sa phrase — « urgence extrême :
 * son téléphone sonne, même verrouillé » — reste VISIBLE au repos. Seul le cas limite (un iPhone en silencieux)
 * passe derrière un (i) dont le nom est la question.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProfileBringExplanationTest {

    @get:Rule
    val compose = createComposeRule()

    private val sentence = "For an extreme emergency: their phone rings, even when locked."
    private val question = "What if their phone is on silent?"
    private val detail = "Depending on settings, an iPhone on silent may only show a priority alert."

    @Test
    fun `la phrase du Bring est visible au repos sans ouvrir le i`() {
        compose.setContent { MeeshyTheme { BringExplanation() } }
        compose.onNodeWithText(sentence).assertIsDisplayed()
        compose.onNodeWithText(detail).assertDoesNotExist()
    }

    @Test
    fun `le cas limite iPhone est derriere un i nomme par la question et reste lu`() {
        compose.setContent { MeeshyTheme { BringExplanation() } }
        val info = compose.onNodeWithContentDescription(question)
        info.assertIsDisplayed().assertWidthIsAtLeast(48.dp)
        assertThat(info.fetchSemanticsNode().config[SemanticsProperties.StateDescription]).isEqualTo(detail)
        info.performClick()
        compose.onNodeWithText(detail).assertIsDisplayed()
    }
}
