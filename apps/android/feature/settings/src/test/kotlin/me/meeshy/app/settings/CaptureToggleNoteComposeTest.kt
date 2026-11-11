package me.meeshy.app.settings

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Image
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La rangée d'un réglage épuré : le libellé nomme, le (i) porte la question, la note reste lue (#17659). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CaptureToggleNoteComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val note = MeeshyInfoNote(question = "What does the original contain?", text = "The raw photo, without effects.")

    private fun show(onChecked: (Boolean) -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                var open by remember { mutableStateOf<String?>(null) }
                val host = NoteHost(open) { open = it }
                CaptureToggleRow(
                    icon = Icons.Filled.Image,
                    title = "Save the original",
                    checked = false,
                    onCheckedChange = onChecked,
                    note = note,
                    noteHost = host,
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the row shows only its name and the info button is named by the question`() {
        show()

        compose.onNodeWithText("Save the original").assertExists()
        compose.onNodeWithText(note.text).assertDoesNotExist()
        compose.onNodeWithContentDescription(note.question).assertExists()
    }

    @Test
    fun `the note stays available to the screen reader while folded`() {
        show()

        compose.onNodeWithContentDescription(note.question).assert(
            androidx.compose.ui.test.SemanticsMatcher("state description is the note") {
                it.config.getOrNull(SemanticsProperties.StateDescription) == note.text
            },
        )
    }

    @Test
    fun `the info button is a 48dp target`() {
        assertThat(me.meeshy.ui.component.MeeshyInfoNoteTarget.value).isAtLeast(48f)
    }

    @Test
    fun `touching the info button never toggles the setting`() {
        var toggles = 0
        show { toggles++ }

        compose.onNode(hasContentDescription(note.question)).performClick()
        compose.waitForIdle()

        assertThat(toggles).isEqualTo(0)
    }
}
