package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
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

/**
 * Fermer un brouillon non vide — croix, retour système ou glissé vers le bas — demande confirmation (#13838), comme pour une
 * diapo (#13616) : « Garder le brouillon » ferme et garde, « Abandonner » ferme et purge, toucher à côté ne ferme rien. Un
 * brouillon vide se ferme sans question.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerCloseConfirmationTest {

    @get:Rule
    val compose = createComposeRule()

    private class Calls {
        var kept = 0
        var discarded = 0
    }

    private fun show(hasContent: Boolean, editing: Boolean = false): Calls {
        val calls = Calls()
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(360.dp, 692.dp)) {
                    val close = rememberConfirmedComposerClose(
                        hasContent = hasContent,
                        editingPublished = editing,
                        onKeep = { calls.kept++ },
                        onDiscard = { calls.discarded++ },
                    )
                    TextButton(onClick = close.request) { Text(CROSS) }
                }
            }
        }
        return calls
    }

    @Test
    fun `an empty draft closes at once, without a question`() {
        val calls = show(hasContent = false)

        compose.onNodeWithText(CROSS).performClick()

        assertThat(calls.kept).isEqualTo(1)
        compose.onNodeWithText(TITLE).assertDoesNotExist()
    }

    @Test
    fun `a draft with content asks before closing and closes nothing yet`() {
        val calls = show(hasContent = true)

        compose.onNodeWithText(CROSS).performClick()

        compose.onNodeWithText(TITLE).assertExists()
        assertThat(calls.kept).isEqualTo(0)
        assertThat(calls.discarded).isEqualTo(0)
    }

    @Test
    fun `keep the draft closes and keeps it`() {
        val calls = show(hasContent = true)
        compose.onNodeWithText(CROSS).performClick()

        compose.onNodeWithText(KEEP).performClick()

        assertThat(calls.kept).isEqualTo(1)
        assertThat(calls.discarded).isEqualTo(0)
        compose.onNodeWithText(TITLE).assertDoesNotExist()
    }

    @Test
    fun `discard closes and purges, once`() {
        val calls = show(hasContent = true)
        compose.onNodeWithText(CROSS).performClick()

        compose.onNodeWithText(DISCARD).performClick()

        assertThat(calls.discarded).isEqualTo(1)
        assertThat(calls.kept).isEqualTo(0)
    }

    @Test
    fun `the edit of a published story closes as before, with no draft to keep`() {
        val calls = show(hasContent = true, editing = true)

        compose.onNodeWithText(CROSS).performClick()

        assertThat(calls.kept).isEqualTo(1)
        compose.onNodeWithText(TITLE).assertDoesNotExist()
    }

    private companion object {
        const val CROSS = "cross"
        const val TITLE = "Close the draft?"
        const val KEEP = "Keep the draft"
        const val DISCARD = "Discard"
    }
}
