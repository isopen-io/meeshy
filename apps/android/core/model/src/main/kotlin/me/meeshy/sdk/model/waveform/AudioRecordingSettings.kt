package me.meeshy.sdk.model.waveform

/**
 * Les réglages d'une prise sonore — la table d'iOS (`AudioRecordingSettings.standard / .story /
 * .voiceSample / .opus`, `AudioRecordingProviding.swift`). Un préréglage dit COMMENT on encode
 * ([profile]), sous quel type MIME le fichier voyage, et quel plancher de durée la prise doit atteindre
 * pour servir ([minimumTakeSeconds]) ; il ne dit jamais combien de temps on peut enregistrer : aucun plafond.
 */
public data class AudioRecordingSettings(
    val profile: VoiceEncodingProfile,
    val mimeType: String,
    val fileExtension: String,
    val minimumTakeSeconds: Double,
) {
    public companion object {
        public const val M4A_MIME_TYPE: String = "audio/mp4"
        public const val OGG_MIME_TYPE: String = "audio/ogg"
        private const val M4A_EXTENSION = ".m4a"
        private const val OGG_EXTENSION = ".ogg"
        private const val VOICE_SAMPLE_FLOOR_SECONDS = 10.0
        private const val VOICE_SAMPLE_BIT_RATE = 96_000
        private const val OPUS_SAMPLE_RATE = 48_000
        private const val OPUS_BIT_RATE = 24_000

        private fun aac(bitRate: Int, floor: Double) = AudioRecordingSettings(
            profile = VoiceEncodingProfile.of(VoiceEncodingProfile.Kind.VOICE_MESSAGE).copy(bitRateBitsPerSecond = bitRate),
            mimeType = M4A_MIME_TYPE,
            fileExtension = M4A_EXTENSION,
            minimumTakeSeconds = floor,
        )

        /** Vocal de conversation : AAC 44,1 kHz mono 64 kb/s. */
        public val standard: AudioRecordingSettings = aac(64_000, 0.0)

        /** Son de story : mêmes valeurs que le vocal. */
        public val story: AudioRecordingSettings = aac(64_000, 0.0)

        /** Échantillon de voix à cloner : 96 kb/s, et au moins 10 s de matière. */
        public val voiceSample: AudioRecordingSettings = aac(VOICE_SAMPLE_BIT_RATE, VOICE_SAMPLE_FLOOR_SECONDS)

        /** Opus 48 kHz mono 24 kb/s : défini, DORMANT — aucun écran ne le choisit encore. */
        public val opus: AudioRecordingSettings = AudioRecordingSettings(
            profile = VoiceEncodingProfile(
                container = VoiceEncodingProfile.Container.OGG,
                codec = VoiceEncodingProfile.Codec.OPUS,
                sampleRateHz = OPUS_SAMPLE_RATE,
                channelCount = 1,
                bitRateBitsPerSecond = OPUS_BIT_RATE,
            ),
            mimeType = OGG_MIME_TYPE,
            fileExtension = OGG_EXTENSION,
            minimumTakeSeconds = 0.0,
        )
    }
}
