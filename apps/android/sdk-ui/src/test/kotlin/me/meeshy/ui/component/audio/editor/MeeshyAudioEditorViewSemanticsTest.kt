package me.meeshy.ui.component.audio.editor

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.audioedit.AudioTranscriptionFailure
import me.meeshy.sdk.model.audioedit.AudioTranscriptionState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyAudioEditorViewSemanticsTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(
        state: AudioTranscriptionState,
        language: String = "fr",
        onLanguage: (String) -> Unit = {},
        onTranscribe: () -> Unit = {},
    ) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                // Comme son hôte `AudioEditorToolPanel` : le panneau émet ses rangées dans une Column. Posées à nu,
                // elles se superposeraient et le bouton « Transcrire » prendrait le toucher destiné à une langue.
                Column { AudioEditorTranscribePanel(state, language, Color.Blue, onLanguage, onTranscribe) }
            }
        }
    }

    @Test
    fun `au repos le bouton dit Transcrire et lance la reconnaissance`() {
        val taps = mutableListOf<Unit>()
        show(AudioTranscriptionState.Idle, onTranscribe = { taps += Unit })
        compose.onNodeWithText("Transcribe").performClick()
        assertThat(taps).hasSize(1)
    }

    @Test
    fun `pendant la reconnaissance le bouton laisse place à la progression`() {
        show(AudioTranscriptionState.Running)
        compose.onNodeWithText("Transcribing…").assertExists()
        compose.onAllNodes(hasText("Transcribe")).assertCountEquals(0)
    }

    @Test
    fun `un texte obtenu s'affiche et le bouton propose de recommencer`() {
        show(AudioTranscriptionState.Done("bonjour tout le monde", "fr"))
        compose.onNodeWithText("bonjour tout le monde").assertExists()
        compose.onNodeWithText("Transcribe again").assertExists()
    }

    @Test
    fun `un échec dit sa raison`() {
        show(AudioTranscriptionState.Failed(AudioTranscriptionFailure.NO_SPEECH))
        compose.onNodeWithText("No speech detected.").assertExists()
    }

    @Test
    fun `le refus de permission se dit`() {
        show(AudioTranscriptionState.PermissionDenied)
        compose.onNodeWithText("Speech recognition access denied. Enable it in Settings.").assertExists()
    }

    @Test
    fun `la langue choisie est annoncée sélectionnée et un tap en change`() {
        val chosen = mutableListOf<String>()
        show(AudioTranscriptionState.Idle, language = "fr", onLanguage = { chosen += it })
        compose.onNodeWithText(languageName("fr")).assertIsSelected()
        compose.onNodeWithText(languageName("es")).performClick()
        assertThat(chosen).containsExactly("es")
    }
}
