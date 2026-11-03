package me.meeshy.app.chat

import android.Manifest
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.sdk.recording.AudioRecordingProviding
import me.meeshy.sdk.recording.AudioRecordingResult
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.sdk.model.PermissionFlowState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatComposerRecordingTest {

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
            session = session.tick(takeSeconds).stop().session
            onResult(
                if (takeSeconds < 0.5) {
                    null
                } else {
                    AudioRecordingResult(File.createTempFile("take", ".m4a").apply { writeBytes(byteArrayOf(1)) }, takeSeconds, listOf(0.5f), "audio/mp4")
                },
            )
        }

        override fun cancel() {
            session = session.cancel()
        }

        override fun abandon(onResult: (AudioRecordingResult?) -> Unit) = onResult(null)
    }

    private class Harness {
        var handle: ComposerVoiceHandle? = null
        val picked = mutableListOf<String>()
    }

    @Composable
    private fun Host(harness: Harness, recorder: FakeRecorder) {
        MeeshyTheme(darkTheme = false) {
            val voice = rememberComposerVoice(null, { _, name, _ -> harness.picked += name }, newRecorder = { recorder })
            harness.handle = voice
            PermissionFlowHost(voice.permissions)
        }
    }

    @Test
    fun `un micro refuse ne demarre aucune prise et la porte l'explique`() {
        shadowOf(RuntimeEnvironment.getApplication()).denyPermissions(Manifest.permission.RECORD_AUDIO)
        val harness = Harness()
        val recorder = FakeRecorder(2.0)
        compose.setContent { Host(harness, recorder) }

        compose.runOnUiThread { harness.handle!!.request() }
        compose.waitUntil(ASYNC_MS) { harness.handle!!.permissions.state != PermissionFlowState.Idle }

        assertThat(recorder.started).isEqualTo(0)
        assertThat(harness.handle!!.isRecording).isFalse()
        assertThat(harness.handle!!.permissions.state).isNotEqualTo(PermissionFlowState.Idle)
    }

    @Test
    fun `une prise trop courte est ecartee sans rien envoyer`() {
        shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.RECORD_AUDIO)
        val harness = Harness()
        val recorder = FakeRecorder(0.3)
        compose.setContent { Host(harness, recorder) }

        compose.runOnUiThread { harness.handle!!.request() }
        compose.waitUntil(ASYNC_MS) { harness.handle!!.isRecording }
        compose.runOnUiThread { harness.handle!!.finish() }
        compose.waitForIdle()

        assertThat(harness.picked).isEmpty()
        assertThat(harness.handle!!.isRecording).isFalse()
    }

    @Test
    fun `une prise assez longue rejoint le plateau`() {
        shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.RECORD_AUDIO)
        val harness = Harness()
        val recorder = FakeRecorder(2.0)
        compose.setContent { Host(harness, recorder) }

        compose.runOnUiThread { harness.handle!!.request() }
        compose.waitUntil(ASYNC_MS) { harness.handle!!.isRecording }
        compose.runOnUiThread { harness.handle!!.finish() }
        compose.waitForIdle()

        assertThat(harness.picked).hasSize(1)
    }

    private companion object {
        const val ASYNC_MS = 5_000L
    }
}
