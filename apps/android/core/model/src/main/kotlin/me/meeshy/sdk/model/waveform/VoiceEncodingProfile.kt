package me.meeshy.sdk.model.waveform

/**
 * Comment un vocal ou un son de story est ENCODÉ à l'enregistrement — la table d'iOS
 * (`AudioRecordingSettings.standard` et `.story`, `AudioRecordingProviding.swift`) : AAC-LC dans un
 * conteneur MPEG-4 (`.m4a`), 44 100 Hz, mono, 64 kb/s.
 *
 * Sans ces valeurs, `MediaRecorder` retombe sur les défauts de la plateforme (AOSP
 * `StagefrightRecorder::reset` : 8 000 Hz, 1 canal, 12 200 b/s) : une voix en bande téléphonique, que
 * la transcription lit moins bien. Loi pure : l'adaptateur `MediaRecorder` ne fait que la transcrire.
 */
public data class VoiceEncodingProfile(
    val container: Container,
    val codec: Codec,
    val sampleRateHz: Int,
    val channelCount: Int,
    val bitRateBitsPerSecond: Int,
) {
    public enum class Container { MPEG_4, OGG }

    public enum class Codec { AAC_LC, OPUS }

    /** Ce qu'on enregistre : un vocal de conversation ou le son d'une story. */
    public enum class Kind { VOICE_MESSAGE, STORY_SOUND }

    /** Poids prévisible d'une minute de prise : 480 000 octets à 64 kb/s. */
    public val bytesPerMinute: Long
        get() = bitRateBitsPerSecond / BITS_PER_BYTE * SECONDS_PER_MINUTE

    public companion object {
        private const val BITS_PER_BYTE = 8L
        private const val SECONDS_PER_MINUTE = 60L

        private val VOICE = VoiceEncodingProfile(
            container = Container.MPEG_4,
            codec = Codec.AAC_LC,
            sampleRateHz = 44_100,
            channelCount = 1,
            bitRateBitsPerSecond = 64_000,
        )

        public fun of(kind: Kind): VoiceEncodingProfile = when (kind) {
            Kind.VOICE_MESSAGE -> VOICE
            Kind.STORY_SOUND -> VOICE
        }
    }
}
