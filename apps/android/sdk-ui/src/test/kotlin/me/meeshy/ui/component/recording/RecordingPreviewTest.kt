package me.meeshy.ui.component.recording

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.ui.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RecordingPreviewTest {
    @get:Rule val compose = createComposeRule()

    private fun str(id: Int) = ApplicationProvider.getApplicationContext<android.content.Context>().getString(id)

    private val file = File("/tmp/prise.m4a")

    private fun show(
        engine: FakePlaybackEngine,
        accepted: MutableList<Unit> = mutableListOf(),
        redone: MutableList<Unit> = mutableListOf(),
        edit: (() -> Unit)? = null,
    ) {
        compose.setContent {
            StillMotion {
                RecordingPreview(
                    file = file,
                    durationSeconds = 3.0,
                    levels = listOf(0.1f, 0.5f, 0.9f),
                    accent = Color(0xFF6366F1),
                    engine = engine,
                    onAccept = { accepted += Unit },
                    onRedo = { redone += Unit },
                    onEdit = edit,
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `le premier appui sur lecture charge la prise dans le moteur`() {
        val engine = FakePlaybackEngine()
        show(engine)
        compose.onNodeWithContentDescription(str(R.string.media_audio_play)).performClick()
        compose.waitForIdle()
        assertThat(engine.localPlays).containsExactly(RECORDING_PREVIEW_PLAYBACK_ID to file.toURI().toString())
    }

    @Test
    fun `accepter et refaire sont rendus a l'appelant`() {
        val accepted = mutableListOf<Unit>()
        val redone = mutableListOf<Unit>()
        show(FakePlaybackEngine(), accepted, redone)
        compose.onNodeWithContentDescription(str(R.string.audio_recorder_accept)).performClick()
        compose.onNodeWithContentDescription(str(R.string.audio_recorder_redo)).performClick()
        assertThat(accepted).hasSize(1)
        assertThat(redone).hasSize(1)
    }

    @Test
    fun `le bouton editer n'existe que si l'editeur est branche`() {
        show(FakePlaybackEngine())
        compose.onNodeWithContentDescription(str(R.string.audio_recorder_edit)).assertDoesNotExist()
    }

    @Test
    fun `l'editeur branche apparait et se declenche`() {
        val edits = mutableListOf<Unit>()
        show(FakePlaybackEngine(), edit = { edits += Unit })
        compose.onNodeWithContentDescription(str(R.string.audio_recorder_edit)).assertIsDisplayed()
        compose.onNodeWithContentDescription(str(R.string.audio_recorder_edit)).performClick()
        assertThat(edits).hasSize(1)
    }
}
