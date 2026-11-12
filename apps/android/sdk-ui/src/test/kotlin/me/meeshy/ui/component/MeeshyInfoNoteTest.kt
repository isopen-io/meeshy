package me.meeshy.ui.component

import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LE (i) DE L'ÉPURE (#17587, épure #17584) — le nom accessible est la QUESTION, la note se déplie au
 * toucher, un seul (i) est ouvert par écran, et « fermer » referme la note ouverte.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyInfoNoteTest {

    @get:Rule
    val compose = createComposeRule()

    private val presence = MeeshyInfoNote("Qui voit ma présence ?", "Seuls vos amis voient que vous êtes en ligne.")
    private val sounds = MeeshyInfoNote("Que coupe ce réglage ?", "Les sons et les bannières.")

    private fun showTwo() {
        compose.setContent {
            MeeshyTheme {
                var open by remember { mutableStateOf<String?>(null) }
                Column {
                    MeeshyInfoNoted(note = presence, openNoteId = open, onOpenNoteIdChange = { open = it }) { Text("Présence") }
                    MeeshyInfoNoted(note = sounds, openNoteId = open, onOpenNoteIdChange = { open = it }) { Text("Sons") }
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `toucher la note ouverte la referme, toucher une autre l ouvre seule`() {
        assertThat(MeeshyInfoNote.toggled(null, presence.id)).isEqualTo(presence.id)
        assertThat(MeeshyInfoNote.toggled(presence.id, presence.id)).isNull()
        assertThat(MeeshyInfoNote.toggled(presence.id, sounds.id)).isEqualTo(sounds.id)
        assertThat(MeeshyInfoNote.closed(sounds.id, presence.id)).isEqualTo(sounds.id)
        assertThat(MeeshyInfoNote.closed(presence.id, presence.id)).isNull()
    }

    @Test
    fun `sans note, le nom seul et aucun i`() {
        compose.setContent {
            MeeshyTheme {
                MeeshyInfoNoted(note = null, openNoteId = null, onOpenNoteIdChange = {}) { Text("Présence") }
            }
        }
        compose.onNodeWithText("Présence").assertIsDisplayed()
        compose.onNodeWithContentDescription(presence.question).assertDoesNotExist()
    }

    @Test
    fun `le i porte la question pour nom et une cible de 48 dp, la note repliee n est pas affichee`() {
        showTwo()
        compose.onNodeWithContentDescription(presence.question)
            .assertIsDisplayed()
            .assertWidthIsAtLeast(MeeshyInfoNoteTarget)
            .assertHeightIsAtLeast(MeeshyInfoNoteTarget)
        compose.onNodeWithText(presence.text).assertDoesNotExist()
    }

    @Test
    fun `toucher le i deplie la note, et un seul i reste ouvert`() {
        showTwo()
        compose.onNodeWithContentDescription(presence.question).performClick()
        compose.onNodeWithText(presence.text).assertIsDisplayed()

        compose.onNodeWithContentDescription(sounds.question).performClick()
        compose.onNodeWithText(sounds.text).assertIsDisplayed()
        compose.onNodeWithText(presence.text).assertDoesNotExist()
    }

    @Test
    fun `fermer referme la note ouverte`() {
        showTwo()
        compose.onNodeWithContentDescription(presence.question).performClick()
        compose.onNodeWithText(presence.text).performSemanticsAction(SemanticsActions.Dismiss)
        compose.onNodeWithText(presence.text).assertDoesNotExist()
    }
}
