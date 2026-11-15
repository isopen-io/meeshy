package me.meeshy.app.settings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.sdk.model.session.GeolocationAttribution
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le pied des sessions : la licence reste visible, le lieu approximatif passe derrière un (i) (#17659). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ActiveSessionsFooterComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val note = MeeshyInfoNote(question = "Where does a session's place come from?", text = "Places are approximate, derived from the IP address.")

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                var open by remember { mutableStateOf<String?>(null) }
                ActiveSessionsFooter(GeolocationAttribution.DB_IP, note, NoteHost(open) { open = it })
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the licence stays visible and the note is folded at rest`() {
        show()

        compose.onNodeWithText(GeolocationAttribution.DB_IP.text).assertExists()
        compose.onNodeWithText(note.text).assertDoesNotExist()
    }

    @Test
    fun `the info button is named by the question and carries the note to the screen reader`() {
        show()

        compose.onNodeWithContentDescription(note.question).assert(
            SemanticsMatcher("state description is the note") {
                it.config.getOrNull(SemanticsProperties.StateDescription) == note.text
            },
        )
    }

    @Test
    fun `touching the info button unfolds the note below`() {
        show()

        compose.onNodeWithContentDescription(note.question).performClick()
        compose.waitForIdle()

        compose.onNodeWithText(note.text).assertExists()
    }
}
