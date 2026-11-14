package me.meeshy.app.game.pages

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

/** Une phrase d'orientation visible au repos ; le détail secondaire derrière un (i) dont le nom est la question. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameNoteWithInfoComposeTest {

    @get:Rule val compose = createComposeRule()

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                GameNoteWithInfo(
                    text = "Le jeu disparaît de cet appareil et se ferme aux autres.",
                    question = "Que ferme le masquage ?",
                    detail = "Ferme tes trophées, ton rang, ton Héritage et ton Atlas.",
                )
            }
        }
    }

    @Test
    fun `au repos la phrase d orientation est lue sans clic et le detail est replie`() {
        show()
        compose.onNodeWithText("Le jeu disparaît de cet appareil et se ferme aux autres.").assertIsDisplayed()
        compose.onNodeWithText("Ferme tes trophées, ton rang, ton Héritage et ton Atlas.").assertDoesNotExist()
    }

    @Test
    fun `le i a pour nom la question et pour description d etat le detail`() {
        show()
        val info = compose.onNodeWithContentDescription("Que ferme le masquage ?")
        info.assertIsDisplayed()
        assertThat(info.fetchSemanticsNode().config[SemanticsProperties.StateDescription])
            .isEqualTo("Ferme tes trophées, ton rang, ton Héritage et ton Atlas.")
    }

    @Test
    fun `toucher le i deplie le detail sous la phrase et le re toucher le replie`() {
        show()
        compose.onNodeWithContentDescription("Que ferme le masquage ?").performClick()
        compose.onNodeWithText("Ferme tes trophées, ton rang, ton Héritage et ton Atlas.").assertIsDisplayed()
        compose.onNodeWithContentDescription("Que ferme le masquage ?").performClick()
        compose.onNodeWithText("Ferme tes trophées, ton rang, ton Héritage et ton Atlas.").assertDoesNotExist()
    }
}
