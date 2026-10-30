package me.meeshy.sdk.model

import kotlin.math.roundToInt
import kotlinx.serialization.Serializable
import me.meeshy.sdk.lang.AttachmentTranscriptPrism
import me.meeshy.sdk.lang.LanguageResolver

/**
 * LA FICHE TRANSCRIPTION d'un message audio ou vidéo (#13779) — miroir de `MessageTranscriptionDetailView` (iOS) :
 * la transcription complète (langue, confiance, durée, locuteurs), puis ses traductions parlées. La traduction que le
 * Prisme SERT ([AttachmentTranscriptPrism], le site que la bulle lit aussi) passe en tête et se marque ; les autres
 * suivent. Sans transcription, la fiche montre les pièces et propose de transcrire (le serveur ne transcrit qu'un son) ;
 * la demande a trois états : au repos, en cours (le résultat arrive par la socket), en échec (réessayable).
 */
object MessageTranscriptionFiche {

    enum class Request { IDLE, IN_FLIGHT, FAILED }

    data class Media(val attachmentId: String, val name: String?, val isVideo: Boolean, val durationSeconds: Int?)

    data class Original(
        val text: String,
        val language: String?,
        val confidencePercent: Int?,
        val durationSeconds: Int?,
        val speakerCount: Int?,
        val segments: List<Segment> = emptyList(),
    )

    /**
     * Un mot (ou segment) de la transcription, iOS `TranscriptionDisplaySegment`. [speakerColorHex] : la teinte de son
     * locuteur, attribuée dans l'ordre d'apparition sur [SPEAKER_PALETTE] ; `null` quand un seul locuteur parle.
     */
    data class Segment(val text: String, val speakerColorHex: String?)

    data class Translation(
        val language: String,
        val text: String,
        val durationSeconds: Int?,
        val isCloned: Boolean,
        val isServed: Boolean,
    )

    sealed interface State {
        /** Aucune pièce qui se transcrive : la fiche n'a rien à dire. */
        data object Unavailable : State

        /** Pas encore de transcription. [transcribable] : la pièce son que le serveur sait transcrire, s'il y en a une. */
        data class Empty(val media: List<Media>, val transcribable: String?, val request: Request) : State

        data class Ready(val original: Original, val translations: List<Translation>) : State
    }

    fun of(
        attachments: List<ApiMessageAttachment>,
        preferences: LanguageResolver.ContentLanguagePreferences,
        request: Request,
    ): State {
        val timebased = attachments.filter { it.isAudio || it.isVideo }
        if (timebased.isEmpty()) return State.Unavailable
        val transcribed = timebased.firstOrNull { AttachmentTranscriptPrism.originalText(it.transcription) != null }
            ?: return State.Empty(
                media = timebased.map { it.toMedia() },
                transcribable = timebased.firstOrNull { it.isAudio }?.id,
                request = request,
            )
        return State.Ready(original = originalOf(transcribed), translations = translationsOf(transcribed, preferences))
    }

    /** La transcription que `POST /attachments/:id/transcribe` rend quand elle existe déjà (`status: completed`). */
    @Serializable
    data class TranscribeOutcome(val status: String? = null, val transcription: ApiAttachmentTranscription? = null) {
        val completed: ApiAttachmentTranscription?
            get() = transcription?.takeIf { status == "completed" && AttachmentTranscriptPrism.originalText(it) != null }
    }

    private fun originalOf(attachment: ApiMessageAttachment): Original {
        val transcription = attachment.transcription
        return Original(
            text = AttachmentTranscriptPrism.originalText(transcription).orEmpty(),
            language = transcription?.language?.trim()?.ifBlank { null },
            confidencePercent = transcription?.confidence?.takeIf { it in 0.0..1.0 }?.let { (it * 100).roundToInt() },
            durationSeconds = (transcription?.durationMs ?: attachment.duration)?.let { it / MILLIS_PER_SECOND },
            speakerCount = transcription?.speakerCount?.takeIf { it > 1 },
            segments = segmentsOf(transcription),
        )
    }

    private fun segmentsOf(transcription: ApiAttachmentTranscription?): List<Segment> {
        val spoken = transcription?.segments.orEmpty().mapNotNull { segment ->
            segment.text.trim().ifBlank { null }?.let { it to (segment.speakerId ?: UNNAMED_SPEAKER) }
        }
        val tinted = (transcription?.speakerCount ?: 1) > 1
        val speakerRank = spoken.map { it.second }.distinct().withIndex().associate { (rank, speaker) -> speaker to rank }
        return spoken.map { (text, speaker) ->
            Segment(text, SPEAKER_PALETTE[speakerRank.getValue(speaker) % SPEAKER_PALETTE.size].takeIf { tinted })
        }
    }

    private fun translationsOf(
        attachment: ApiMessageAttachment,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): List<Translation> {
        val served = AttachmentTranscriptPrism.served(attachment.transcription, attachment.translations, preferences)
            ?.takeIf { it.isTranslated }?.language
        return attachment.translations.orEmpty().mapNotNull { (language, translation) ->
            val text = translation.transcription?.trim()?.ifBlank { null } ?: return@mapNotNull null
            Translation(
                language = language,
                text = text,
                durationSeconds = translation.durationMs?.let { it / MILLIS_PER_SECOND },
                isCloned = translation.cloned == true,
                isServed = served != null && language.equals(served, ignoreCase = true),
            )
        }.sortedWith(compareByDescending<Translation> { it.isServed }.thenBy { it.language.lowercase() })
    }

    private fun ApiMessageAttachment.toMedia() = Media(
        attachmentId = id,
        name = (originalName ?: fileName)?.trim()?.ifBlank { null },
        isVideo = isVideo,
        durationSeconds = duration?.let { it / MILLIS_PER_SECOND },
    )

    private val ApiMessageAttachment.isAudio: Boolean get() = mimeType?.startsWith("audio/") == true
    private val ApiMessageAttachment.isVideo: Boolean get() = mimeType?.startsWith("video/") == true

    private const val MILLIS_PER_SECOND = 1000

    private const val UNNAMED_SPEAKER = "default"

    /** La palette des locuteurs d'iOS (`TranscriptionDisplaySegment.speakerPalette`), dans son ordre. */
    val SPEAKER_PALETTE: List<String> = listOf("08D9D6", "FF6B6B", "9B59B6", "F8B500", "2ECC71", "E91E63", "3498DB", "FF7F50")
}
