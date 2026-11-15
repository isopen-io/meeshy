package me.meeshy.sdk.model

/**
 * LE site des défauts d'une piste parlée traduite et du mapping des segments (miroir de `AttachmentMetadataMapping`,
 * iOS) : la passerelle sert des pistes partielles (`format`, `ttsModel`, `durationMs` absents quand le moteur ne les
 * dit pas), et chaque surface — le fil, le fil d'actualité, la fiche — les complète de la MÊME façon.
 */
object AttachmentMetadataMapping {

    const val DEFAULT_FORMAT: String = "mp3"
    const val DEFAULT_TTS_MODEL: String = "xtts"

    /** Un segment servi (secondes, le décodage a déjà converti les millisecondes) vers celui que les écrans lisent. */
    fun segment(segment: TranscriptionSegment): MessageTranscriptionSegment = MessageTranscriptionSegment(
        text = segment.text,
        startTime = segment.startTime,
        endTime = segment.endTime,
        speakerId = segment.speakerId,
    )

    /**
     * La piste parlée de [attachmentId] dans [language], complétée de ses défauts (transcription vide, durée 0, format
     * [DEFAULT_FORMAT], voix non clonée, qualité 0, moteur [DEFAULT_TTS_MODEL]). `null` sans adresse lisible : une
     * piste qui ne se joue pas ne doit pas faire croire qu'une voix existe. [resolveUrl] passe l'adresse servie par le
     * résolveur de médias de l'appelant.
     */
    fun translatedAudio(
        attachmentId: String,
        language: String,
        track: ApiAttachmentTranslation,
        resolveUrl: (String) -> String = { it },
    ): MessageTranslatedAudio? {
        val url = track.url?.trim().orEmpty().ifEmpty { return null }
        return MessageTranslatedAudio(
            id = "${attachmentId}_$language",
            attachmentId = attachmentId,
            targetLanguage = language,
            url = resolveUrl(url),
            transcription = track.transcription.orEmpty(),
            durationMs = track.durationMs ?: 0,
            format = track.format ?: DEFAULT_FORMAT,
            cloned = track.cloned ?: false,
            quality = track.quality ?: 0.0,
            voiceModelId = track.voiceModelId,
            ttsModel = track.ttsModel ?: DEFAULT_TTS_MODEL,
            segments = track.segments.orEmpty().map(::segment),
        )
    }
}
