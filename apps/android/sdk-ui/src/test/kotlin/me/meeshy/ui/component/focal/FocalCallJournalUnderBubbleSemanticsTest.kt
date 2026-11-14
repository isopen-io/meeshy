package me.meeshy.ui.component.focal

import android.content.Context
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A1.3 — « Afficher / Masquer la transcription » annonce son état à TalkBack : « Replié » puis « Déplié », comme iOS
 * (`accessibilityValue`, `message.long.collapsed/expanded`) et le web (`aria-expanded`). Les deux mots existent déjà
 * dans les sept langues (`focal_long_message_collapsed/expanded`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalCallJournalUnderBubbleSemanticsTest {

    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<Context>()

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                FocalCallJournalUnderBubble(
                    request = CallJournalRequest(callId = "call-1", startedAtIso = "2026-11-14T10:00:00Z", accent = Color(0xFF6366F1)),
                    slot = { Text("journal") },
                    alignEnd = false,
                )
            }
        }
        compose.waitForIdle()
    }

    private fun says(state: Int) =
        SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, context.getString(state))

    @Test
    fun `replie, la bascule annonce Replie`() {
        show()

        compose.onNodeWithText(context.getString(R.string.focal_call_journal_show))
            .assert(says(R.string.focal_long_message_collapsed))
    }

    @Test
    fun `depliee, la bascule annonce Deplie, puis Replie quand on la replie`() {
        show()

        compose.onNodeWithText(context.getString(R.string.focal_call_journal_show)).performClick()
        compose.waitForIdle()
        compose.onNodeWithText(context.getString(R.string.focal_call_journal_hide))
            .assert(says(R.string.focal_long_message_expanded))

        compose.onNodeWithText(context.getString(R.string.focal_call_journal_hide)).performClick()
        compose.waitForIdle()
        compose.onNodeWithText(context.getString(R.string.focal_call_journal_show))
            .assert(says(R.string.focal_long_message_collapsed))
    }

    @Test
    fun `l'etat se lit par un mot, distinct dans les deux sens`() {
        assertThat(focalCallJournalToggleState(open = true)).isEqualTo(R.string.focal_long_message_expanded)
        assertThat(focalCallJournalToggleState(open = false)).isEqualTo(R.string.focal_long_message_collapsed)
        assertThat(context.getString(focalCallJournalToggleState(open = true)))
            .isNotEqualTo(context.getString(focalCallJournalToggleState(open = false)))
    }
}
