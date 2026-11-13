package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Sous la transcription d'un appel, les deux endroits où elle vit restent LISIBLES au repos (règle 7) ;
 * seul ce que le journal contient attend derrière son (i), nommé par la question à laquelle il répond (#18083).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallTranscriptDisclaimerTest {

    @get:Rule
    val compose = createComposeRule()

    private val place = "Encrypted copy on this device. The call transcript is also kept on the Meeshy server, readable only by the call’s participants."
    private val question = "What does this log contain?"
    private val note = "It includes what the other person said, as received during the call."

    private fun show() {
        compose.setContent { MeeshyTheme { TranscriptDisclaimer() } }
        compose.waitForIdle()
    }

    @Test
    fun `the two places stay visible at rest and the content of the log is folded`() {
        show()

        compose.onNodeWithText(place).assertIsDisplayed()
        compose.onNodeWithText(note).assertDoesNotExist()
    }

    @Test
    fun `the info button is named by the question and carries the note for the screen reader`() {
        show()

        compose.onNodeWithContentDescription(question).assert(
            SemanticsMatcher("state description is the note") { it.config.getOrNull(SemanticsProperties.StateDescription) == note },
        )
    }

    @Test
    fun `touching the info button unfolds the note under the row`() {
        show()

        compose.onNodeWithContentDescription(question).performClick()
        compose.waitForIdle()

        compose.onNodeWithText(note).assertIsDisplayed()
    }
}
