package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioRecordingSettingsTest {

    @Test
    fun `standard et story sont 44,1 kHz mono 64 kbit par seconde AAC en m4a`() {
        listOf(AudioRecordingSettings.standard, AudioRecordingSettings.story).forEach {
            assertThat(it.profile.sampleRateHz).isEqualTo(44_100)
            assertThat(it.profile.channelCount).isEqualTo(1)
            assertThat(it.profile.bitRateBitsPerSecond).isEqualTo(64_000)
            assertThat(it.profile.codec).isEqualTo(VoiceEncodingProfile.Codec.AAC_LC)
            assertThat(it.mimeType).isEqualTo("audio/mp4")
            assertThat(it.fileExtension).isEqualTo(".m4a")
        }
    }

    @Test
    fun `l'echantillon vocal est a 96 kbit par seconde et impose dix secondes`() {
        assertThat(AudioRecordingSettings.voiceSample.profile.bitRateBitsPerSecond).isEqualTo(96_000)
        assertThat(RecordingTakePolicy.minimumSeconds(AudioRecordingSettings.voiceSample)).isEqualTo(10.0)
    }

    @Test
    fun `le prereglage Opus existe en 48 kHz mono 24 kbit par seconde`() {
        val opus = AudioRecordingSettings.opus
        assertThat(opus.profile.codec).isEqualTo(VoiceEncodingProfile.Codec.OPUS)
        assertThat(opus.profile.sampleRateHz).isEqualTo(48_000)
        assertThat(opus.profile.bitRateBitsPerSecond).isEqualTo(24_000)
    }
}
