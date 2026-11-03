package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.waveform.VoiceEncodingProfile.Codec
import me.meeshy.sdk.model.waveform.VoiceEncodingProfile.Container
import me.meeshy.sdk.model.waveform.VoiceEncodingProfile.Kind
import org.junit.Test

/**
 * Le profil d'encodage d'un vocal, d'un son de story : celui d'iOS (`AudioRecordingSettings.standard`
 * et `.story`, `AudioRecordingProviding.swift`), pas les défauts de la plateforme (8 000 Hz, 1 canal,
 * 12 200 b/s sur AOSP : une voix en bande téléphonique que la transcription lit mal).
 */
class VoiceEncodingProfileTest {

    private data class IosRow(val sampleRate: Int, val channels: Int, val bitRate: Int)

    private val iosStandard = IosRow(sampleRate = 44_100, channels = 1, bitRate = 64_000)
    private val iosStory = IosRow(sampleRate = 44_100, channels = 1, bitRate = 64_000)

    private fun rowOf(profile: VoiceEncodingProfile) =
        IosRow(profile.sampleRateHz, profile.channelCount, profile.bitRateBitsPerSecond)

    @Test
    fun `un vocal s'encode en AAC-LC dans un conteneur MPEG-4`() {
        val profile = VoiceEncodingProfile.of(Kind.VOICE_MESSAGE)

        assertThat(profile.container).isEqualTo(Container.MPEG_4)
        assertThat(profile.codec).isEqualTo(Codec.AAC_LC)
    }

    @Test
    fun `un son de story s'encode en AAC-LC dans un conteneur MPEG-4`() {
        val profile = VoiceEncodingProfile.of(Kind.STORY_SOUND)

        assertThat(profile.container).isEqualTo(Container.MPEG_4)
        assertThat(profile.codec).isEqualTo(Codec.AAC_LC)
    }

    @Test
    fun `un vocal est egal a la ligne standard d'iOS`() {
        assertThat(rowOf(VoiceEncodingProfile.of(Kind.VOICE_MESSAGE))).isEqualTo(iosStandard)
    }

    @Test
    fun `un son de story est egal a la ligne story d'iOS`() {
        assertThat(rowOf(VoiceEncodingProfile.of(Kind.STORY_SOUND))).isEqualTo(iosStory)
    }

    @Test
    fun `la voix est echantillonnee a 44100 Hz en mono a 64 kb par seconde`() {
        val profile = VoiceEncodingProfile.of(Kind.VOICE_MESSAGE)

        assertThat(profile.sampleRateHz).isEqualTo(44_100)
        assertThat(profile.channelCount).isEqualTo(1)
        assertThat(profile.bitRateBitsPerSecond).isEqualTo(64_000)
    }

    @Test
    fun `une minute de vocal pese 480000 octets`() {
        assertThat(VoiceEncodingProfile.of(Kind.VOICE_MESSAGE).bytesPerMinute).isEqualTo(480_000L)
        assertThat(VoiceEncodingProfile.of(Kind.STORY_SOUND).bytesPerMinute).isEqualTo(480_000L)
    }
}
