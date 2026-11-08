package me.meeshy.sdk.audio

import android.media.MediaRecorder
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.waveform.VoiceEncodingProfile
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowMediaRecorder

/**
 * Le micro de la plateforme est configuré par la loi pure [VoiceEncodingProfile], jamais laissé à ses
 * défauts (AOSP : 8 000 Hz, 1 canal, 12 200 b/s, une voix en bande téléphonique).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaRecorderEngineTest {

    private fun recording(kind: VoiceEncodingProfile.Kind): ShadowMediaRecorder {
        @Suppress("DEPRECATION")
        val recorder = MediaRecorder()
        val engine = MediaRecorderEngine(VoiceEncodingProfile.of(kind)) { recorder }
        engine.start(File.createTempFile("take", ".m4a"))
        return shadowOf(recorder)
    }

    @Test
    fun `a voice message is recorded at 44100 Hz, mono, 64 kb per second`() {
        val shadow = recording(VoiceEncodingProfile.Kind.VOICE_MESSAGE)

        assertThat(shadow.audioSamplingRate).isEqualTo(44_100)
        assertThat(shadow.audioChannels).isEqualTo(1)
        assertThat(shadow.audioEncodingBitRate).isEqualTo(64_000)
    }

    @Test
    fun `a story sound is recorded at 44100 Hz, mono, 64 kb per second`() {
        val shadow = recording(VoiceEncodingProfile.Kind.STORY_SOUND)

        assertThat(shadow.audioSamplingRate).isEqualTo(44_100)
        assertThat(shadow.audioChannels).isEqualTo(1)
        assertThat(shadow.audioEncodingBitRate).isEqualTo(64_000)
    }

    @Test
    fun `the take is AAC in an MPEG-4 container from the microphone`() {
        val shadow = recording(VoiceEncodingProfile.Kind.VOICE_MESSAGE)

        assertThat(shadow.audioSource).isEqualTo(MediaRecorder.AudioSource.MIC)
        assertThat(shadow.outputFormat).isEqualTo(MediaRecorder.OutputFormat.MPEG_4)
        assertThat(shadow.audioEncoder).isEqualTo(MediaRecorder.AudioEncoder.AAC)
    }

    @Test
    fun `the recorder is running once the engine has started`() {
        val shadow = recording(VoiceEncodingProfile.Kind.VOICE_MESSAGE)

        assertThat(shadow.state).isEqualTo(ShadowMediaRecorder.STATE_RECORDING)
    }
}
