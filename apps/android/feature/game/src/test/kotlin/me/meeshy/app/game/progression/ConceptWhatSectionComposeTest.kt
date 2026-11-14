package me.meeshy.app.game.progression

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** « C'est quoi ? » : le nom, la phrase, et « Comment m'en servir ? » derrière un (i) lu par le lecteur d'écran. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConceptWhatSectionComposeTest {

    @get:Rule val compose = createComposeRule()

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                ConceptWhatSection(
                    title = "C’est quoi ?",
                    what = "Ta lumière est la somme de tes étincelles.",
                    useQuestion = "Comment m’en servir ?",
                    use = "Ta lumière ouvre le rêve au niveau 5.",
                )
            }
        }
    }

    @Test
    fun `au repos le titre et la phrase sont lus, la note est repliee`() {
        show()
        compose.onNodeWithText("C’EST QUOI ?").assertIsDisplayed()
        compose.onNodeWithText("Ta lumière est la somme de tes étincelles.").assertIsDisplayed()
        compose.onNodeWithText("Ta lumière ouvre le rêve au niveau 5.").assertDoesNotExist()
    }

    @Test
    fun `le i porte la question pour nom et la note pour description d etat`() {
        show()
        val info = compose.onNodeWithContentDescription("Comment m’en servir ?")
        info.assertIsDisplayed()
        val state = info.fetchSemanticsNode().config[SemanticsProperties.StateDescription]
        assertThat(state).isEqualTo("Ta lumière ouvre le rêve au niveau 5.")
    }

    @Test
    fun `toucher le i deplie la note et le re toucher la replie`() {
        show()
        compose.onNodeWithContentDescription("Comment m’en servir ?").performClick()
        compose.onNodeWithText("Ta lumière ouvre le rêve au niveau 5.").assertIsDisplayed()
        compose.onNodeWithContentDescription("Comment m’en servir ?").performClick()
        compose.onNodeWithText("Ta lumière ouvre le rêve au niveau 5.").assertDoesNotExist()
    }
}
