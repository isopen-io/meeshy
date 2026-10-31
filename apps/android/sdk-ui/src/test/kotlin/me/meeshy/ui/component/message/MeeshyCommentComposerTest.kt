package me.meeshy.ui.component.message

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.hasSetTextAction
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La barre de commentaire (#13988) : le composer du fil en mode commentaire — on y écrit, on y pose
 * un emoji, et l'envoi n'existe que pour un commentaire qui a du contenu.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyCommentComposerTest {

    @get:Rule
    val compose = createComposeRule()

    private var sent = 0

    private fun show(initial: String = "", isSending: Boolean = false) {
        compose.setContent {
            var text by remember { mutableStateOf(initial) }
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    MeeshyCommentComposer(
                        text = text,
                        onTextChange = { text = it },
                        placeholder = "Add a comment…",
                        onSend = { sent += 1 },
                        isSending = isSending,
                    )
                }
            }
        }
    }

    @Test
    fun `an empty comment shows its placeholder and cannot be sent`() {
        show()
        compose.onNodeWithText("Add a comment…").assertExists()
        compose.onNodeWithContentDescription("Send").assertIsNotEnabled()
    }

    @Test
    fun `typing a comment arms the send button which sends it`() {
        show()
        compose.onNode(hasSetTextAction()).performTextInput("Bravo")
        compose.onNodeWithContentDescription("Send").assertIsEnabled().performClick()
        assertThat(sent).isEqualTo(1)
    }

    @Test
    fun `the emoji button is offered next to the text`() {
        show(initial = "Top")
        compose.onNodeWithContentDescription("Add an emoji").assertExists()
    }

    @Test
    fun `a comment already leaving shows its progress instead of a second send`() {
        show(initial = "Top", isSending = true)
        compose.onNodeWithContentDescription("Send").assertDoesNotExist()
    }
}
