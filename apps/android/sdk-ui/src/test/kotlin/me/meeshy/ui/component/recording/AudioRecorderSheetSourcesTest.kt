package me.meeshy.ui.component.recording

import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.ui.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class AudioRecorderSheetSourcesTest {
    @get:Rule val compose = createComposeRule()

    private fun str(id: Int) = ApplicationProvider.getApplicationContext<android.content.Context>().getString(id)

    private fun show(
        recorder: FakeRecorder = FakeRecorder(),
        files: (() -> Unit)? = {},
        library: (() -> Unit)? = {},
        accessory: (@androidx.compose.runtime.Composable () -> Unit)? = { Text("accessoire") },
        showsLanguageStrip: Boolean = true,
        cap: Double? = null,
        completed: MutableList<Pair<RecordedAudio, String>> = mutableListOf(),
    ) {
        compose.setContent {
            StillMotion {
                AudioRecorderSheet(
                    recorder = recorder,
                    accent = Color(0xFF6366F1),
                    onRecordComplete = { audio, language -> completed += audio to language },
                    preferredLanguage = "fr",
                    showsLanguageStrip = showsLanguageStrip,
                    capSeconds = cap,
                    onImportAudioFile = files,
                    onOpenSoundLibrary = library,
                    accessory = accessory,
                    requestMicrophone = { MediaPermissionState.GRANTED },
                )
            }
        }
        compose.waitForIdle()
    }

    private fun startTake() {
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_start)).performClick()
        compose.waitForIdle()
    }

    @Test
    fun `au repos les puces et la fente sont visibles`() {
        show()
        compose.onNodeWithText(str(R.string.story_voiceRecorder_fromFiles)).assertIsDisplayed()
        compose.onNodeWithText(str(R.string.story_voiceRecorder_fromLibrary)).assertIsDisplayed()
        compose.onNodeWithText("accessoire").assertIsDisplayed()
    }

    @Test
    fun `pendant la prise les puces et la fente disparaissent`() {
        show()
        startTake()
        compose.onNodeWithText(str(R.string.story_voiceRecorder_fromFiles)).assertDoesNotExist()
        compose.onNodeWithText(str(R.string.story_voiceRecorder_fromLibrary)).assertDoesNotExist()
        compose.onNodeWithText("accessoire").assertDoesNotExist()
    }

    @Test
    fun `une puce sans porte n'existe pas`() {
        show(files = null, library = {})
        compose.onNodeWithText(str(R.string.story_voiceRecorder_fromFiles)).assertDoesNotExist()
        compose.onNodeWithText(str(R.string.story_voiceRecorder_fromLibrary)).assertIsDisplayed()
    }

    @Test
    fun `toucher une puce appelle sa porte`() {
        val opened = mutableListOf<String>()
        show(files = { opened += "files" }, library = { opened += "library" })
        compose.onNodeWithText(str(R.string.story_voiceRecorder_fromFiles)).performClick()
        compose.onNodeWithText(str(R.string.story_voiceRecorder_fromLibrary)).performClick()
        assertThat(opened).containsExactly("files", "library").inOrder()
    }

    @Test
    fun `un hote qui a son selecteur masque la bande de langue`() {
        show(showsLanguageStrip = false)
        compose.onNodeWithText(LanguageData.info("en")!!.nativeName).assertDoesNotExist()
    }

    @Test
    fun `un plafond affiche ecoule sur plafond`() {
        show(cap = 60.0)
        startTake()
        compose.onNode(hasText(" / 1:00", substring = true)).assertIsDisplayed()
    }

    @Test
    fun `arreter la prise rend le fichier et la langue choisie`() {
        val completed = mutableListOf<Pair<RecordedAudio, String>>()
        show(completed = completed)
        compose.onNodeWithText(LanguageData.info("en")!!.nativeName).performClick()
        startTake()
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_stop)).performClick()
        compose.waitForIdle()
        assertThat(completed).hasSize(1)
        assertThat(completed.single().second).isEqualTo("en")
        compose.onNodeWithText(str(R.string.audio_recorder_tapToRecord)).assertIsDisplayed()
    }
}
