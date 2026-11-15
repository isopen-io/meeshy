package me.meeshy.app.conversations

import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class ConversationLongPressPeekTest {

    @get:Rule
    val compose = createComposeRule()

    private var dismissed = 0

    private fun show(reduceMotion: Boolean = false) {
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                MeeshyTheme {
                    ConversationLongPressPeek(
                        onDismiss = { dismissed++ },
                        cardLabel = "Conversation avec Équipe",
                        cardBody = { Text("Dernier message") },
                        quickActions = { Text("Épingler") },
                        allActions = { Text("Détails") },
                    )
                }
            }
        }
    }

    private fun stateIs(label: String) =
        SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, label)

    @Test
    fun `au repos la carte montre le contenu sans en-tete et le menu est compact`() {
        show()

        compose.onNodeWithText("Dernier message").assertIsDisplayed()
        compose.onNodeWithTag(PEEK_CARD_TEST_TAG, useUnmergedTree = true).assertContentDescriptionEquals("Conversation avec Équipe")
        compose.onAllNodesWithText("Équipe").assertCountEquals(0)
        compose.onNodeWithText("Épingler").assertIsDisplayed()
        compose.onNodeWithTag(PEEK_HANDLE_TEST_TAG).assert(stateIs("Quick actions"))
    }

    @Test
    fun `toucher la poignee etend le menu puis le replie`() {
        show(reduceMotion = false)
        val handle = compose.onNodeWithTag(PEEK_HANDLE_TEST_TAG)

        handle.performClick()
        compose.waitForIdle()
        handle.assert(stateIs("All actions"))

        handle.performClick()
        compose.waitForIdle()
        handle.assert(stateIs("Quick actions"))
    }

    @Test
    fun `animations reduites ouvrent directement etendu, toutes les actions atteignables`() {
        show(reduceMotion = true)

        compose.onNodeWithTag(PEEK_HANDLE_TEST_TAG).assert(stateIs("All actions"))
        compose.onNodeWithText("Détails").assertIsDisplayed()
    }

    @Test
    fun `toucher la carte ou le menu ne ferme pas l'apercu`() {
        show()

        compose.onNodeWithText("Dernier message").performClick()
        compose.onNodeWithText("Épingler").performClick()

        assertThat(dismissed).isEqualTo(0)
    }
}
