package me.meeshy.ui.component.voiceprofile

import android.Manifest
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.model.voice.VoiceProfilePrompts
import me.meeshy.sdk.model.voice.VoiceSample
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.sdk.recording.AudioRecordingProviding
import me.meeshy.sdk.recording.AudioRecordingResult
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VoiceRecordingViewTest {

    @get:Rule
    val compose = createComposeRule()

    private class FakeRecorder(private val takeSeconds: Double) : AudioRecordingProviding {
        override var session: VoiceRecordingSession = VoiceRecordingSession.idle()
        override var onInterrupted: ((AudioRecordingResult?) -> Unit)? = null
        var started = 0

        override fun start(onStarted: (Boolean) -> Unit) {
            started += 1
            session = session.start()
            onStarted(true)
        }

        override fun tick(deltaSeconds: Double) {
            session = session.tick(deltaSeconds)
        }

        override fun finish(onResult: (AudioRecordingResult?) -> Unit) {
            session = VoiceRecordingSession.idle()
            val file = File.createTempFile("sample", ".m4a").apply { writeBytes(byteArrayOf(7, 8, 9)) }
            onResult(AudioRecordingResult(file, takeSeconds, listOf(0.5f), "audio/mp4"))
        }

        override fun cancel() {
            session = VoiceRecordingSession.idle()
        }

        override fun abandon(onResult: (AudioRecordingResult?) -> Unit) = onResult(null)
    }

    private fun show(recorder: FakeRecorder, initialLanguage: String? = null, onReady: (List<VoiceSample>) -> Unit = {}) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                VoiceRecordingView(onSamplesReady = onReady, initialLanguage = initialLanguage, newRecorder = { recorder }, readDispatcher = Dispatchers.Unconfined)
            }
        }
    }

    private fun grantMic() = shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.RECORD_AUDIO)

    private fun recordOneTake() {
        compose.onNodeWithTag("voice_record_button").performClick()
        compose.waitUntil(ASYNC_MS) { compose.onAllNodesWithTagCount("voice_elapsed") > 0 }
        compose.onNodeWithTag("voice_record_button").performClick()
        compose.waitForIdle()
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTagCount(tag: String): Int =
        onAllNodesWithTag(tag).fetchSemanticsNodes().size

    private fun hasSample(n: Int) = compose.onAllNodesWithTagCount("voice_sample_$n") > 0

    @Test
    fun `la langue initiale est lue et le bouton de creation est inactif`() {
        show(FakeRecorder(12.0), initialLanguage = "es")

        compose.onNodeWithTag("voice_language_es").assertIsSelected()
        compose.onNodeWithTag("voice_create_profile").assertIsNotEnabled()
        assertThat(compose.onAllNodesWithTagCount("voice_prompt_text")).isEqualTo(1)
    }

    @Test
    fun `une langue hors catalogue retombe sur l'anglais`() {
        show(FakeRecorder(12.0), initialLanguage = "ja")

        compose.onNodeWithTag("voice_language_${VoiceProfilePrompts.FALLBACK_LANGUAGE}").assertIsSelected()
    }

    @Test
    fun `un echantillon trop court est rejete et signale`() {
        grantMic()
        show(FakeRecorder(4.0))

        recordOneTake()

        assertThat(hasSample(1)).isFalse()
        assertThat(compose.onAllNodesWithTagCount("voice_sample_too_short")).isEqualTo(1)
    }

    @Test
    fun `trois echantillons assez longs activent la creation et sont remis avec leur duree`() {
        grantMic()
        var delivered: List<VoiceSample> = emptyList()
        show(FakeRecorder(12.0)) { delivered = it }

        repeat(3) { n ->
            recordOneTake()
            compose.waitUntil(ASYNC_MS) { hasSample(n + 1) }
        }
        compose.onNodeWithTag("voice_create_profile").assertIsEnabled().performSemanticsAction(SemanticsActions.OnClick)

        assertThat(delivered).hasSize(3)
        assertThat(delivered.map { it.durationSeconds }).containsExactly(12.0, 12.0, 12.0)
        assertThat(delivered.first().bytes).isEqualTo(byteArrayOf(7, 8, 9))
    }

    @Test
    fun `la langue se fige des le premier echantillon et un echantillon se supprime`() {
        grantMic()
        show(FakeRecorder(12.0))

        recordOneTake()
        compose.waitUntil(ASYNC_MS) { hasSample(1) }
        compose.onNodeWithTag("voice_language_fr").assertIsNotEnabled()
        compose.onNodeWithTag("voice_sample_delete_1").performClick()
        compose.waitForIdle()

        assertThat(hasSample(1)).isFalse()
        compose.onNodeWithTag("voice_language_fr").assertIsEnabled()
    }

    @Test
    fun `sans acces au micro la porte explique d'abord et aucune prise ne demarre`() {
        shadowOf(RuntimeEnvironment.getApplication()).denyPermissions(Manifest.permission.RECORD_AUDIO)
        val recorder = FakeRecorder(12.0)
        show(recorder)
        val title = RuntimeEnvironment.getApplication().getString(me.meeshy.ui.R.string.media_permission_microphone_rationale_title)

        compose.onNodeWithTag("voice_record_button").performClick()
        compose.waitUntil(ASYNC_MS) { compose.onAllNodesWithText(title).fetchSemanticsNodes().isNotEmpty() }

        assertThat(recorder.started).isEqualTo(0)
    }

    private companion object {
        const val ASYNC_MS = 5_000L
    }
}
