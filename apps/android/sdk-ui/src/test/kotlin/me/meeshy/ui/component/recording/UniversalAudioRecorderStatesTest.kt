package me.meeshy.ui.component.recording

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class UniversalAudioRecorderStatesTest {
    @get:Rule val compose = createComposeRule()

    private fun str(id: Int) = ApplicationProvider.getApplicationContext<android.content.Context>().getString(id)

    private fun show(
        recorder: FakeRecorder = FakeRecorder(),
        engine: FakePlaybackEngine = FakePlaybackEngine(),
        access: MediaPermissionState = MediaPermissionState.GRANTED,
        completed: MutableList<RecordedAudio> = mutableListOf(),
        settingsOpened: MutableList<Unit> = mutableListOf(),
    ) {
        compose.setContent {
            StillMotion {
                UniversalAudioRecorderView(
                    recorder = recorder,
                    playback = engine,
                    contextLabel = "Message",
                    contextIcon = MeeshyIcons.Mic,
                    accent = Color(0xFF6366F1),
                    onComplete = { completed += it },
                    onCancel = {},
                    requestMicrophone = { access },
                    onOpenSettings = { settingsOpened += Unit },
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `pret invite a appuyer pour enregistrer`() {
        show()
        compose.onNodeWithText(str(R.string.audio_recorder_tapToRecord)).assertIsDisplayed()
        compose.onNodeWithText(str(R.string.audio_recorder_record)).assertIsDisplayed()
    }

    @Test
    fun `appuyer sur le gros bouton ouvre le micro et montre l'enregistrement`() {
        val recorder = FakeRecorder()
        show(recorder)
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_start)).performClick()
        compose.waitForIdle()
        assertThat(recorder.starts).isEqualTo(1)
        compose.onNodeWithText(str(R.string.audio_recorder_recording)).assertIsDisplayed()
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_stop)).assertIsDisplayed()
    }

    @Test
    fun `arreter la prise ouvre l'apercu avec accepter`() {
        val completed = mutableListOf<RecordedAudio>()
        show(completed = completed)
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_start)).performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_stop)).performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription(str(R.string.audio_recorder_accept)).assertIsDisplayed()
        compose.onNodeWithContentDescription(str(R.string.audio_recorder_accept)).performClick()
        assertThat(completed).hasSize(1)
        assertThat(completed.single().durationSeconds).isEqualTo(3.0)
    }

    @Test
    fun `annuler en cours de prise rend le micro et revient a l'invite`() {
        val recorder = FakeRecorder()
        show(recorder)
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_start)).performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription(str(R.string.audio_recorder_cancel)).performClick()
        compose.waitForIdle()
        assertThat(recorder.cancels).isAtLeast(1)
        compose.onNodeWithText(str(R.string.audio_recorder_tapToRecord)).assertIsDisplayed()
    }

    @Test
    fun `un micro refuse est explique et propose les reglages`() {
        val recorder = FakeRecorder()
        val settings = mutableListOf<Unit>()
        show(recorder, access = MediaPermissionState.DENIED, settingsOpened = settings)
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_start)).performClick()
        compose.waitForIdle()
        assertThat(recorder.starts).isEqualTo(0)
        compose.onNodeWithText(str(R.string.audio_recorder_micDeniedSettings)).assertIsDisplayed()
        compose.onNodeWithText(str(R.string.media_permission_open_settings)).performClick()
        assertThat(settings).hasSize(1)
    }

    @Test
    fun `un refus simple montre le message court`() {
        show(access = MediaPermissionState.NOT_DETERMINED)
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_start)).performClick()
        compose.waitForIdle()
        compose.onNodeWithText(str(R.string.audio_recorder_micDenied)).assertIsDisplayed()
    }

    @Test
    fun `un micro qui ne s'ouvre pas laisse l'ecran pret`() {
        show(FakeRecorder(opensMicrophone = false))
        compose.onNodeWithContentDescription(str(R.string.story_voiceRecorder_start)).performClick()
        compose.waitForIdle()
        compose.onNodeWithText(str(R.string.audio_recorder_tapToRecord)).assertIsDisplayed()
    }
}
