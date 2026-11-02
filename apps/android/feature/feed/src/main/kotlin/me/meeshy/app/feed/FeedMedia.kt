package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import java.util.Locale
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.DurationFormat
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MAX_POST_MEDIA
import me.meeshy.sdk.model.MessageTranscription
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.MessageTranslatedAudio
import me.meeshy.sdk.model.PostMediaFraming
import me.meeshy.sdk.model.media.AttachmentKind
import me.meeshy.sdk.model.resolvedCaption

/**
 * Un média de post prêt à être rendu par le fil — miroir de `FeedMedia` (iOS) : le
 * type (image, vidéo, audio, document), l'URL résolue, la vignette, le thumbHash,
 * la teinte, le ratio, la durée formatée, les informations de document, les pistes
 * audio traduites et la transcription.
 */
@Immutable
data class FeedMediaItem(
    val id: String,
    val type: FeedMediaType,
    val url: String,
    val thumbnailUrl: String?,
    val thumbHash: String?,
    /** Teinte hex à six chiffres sans `#` (table `AttachmentKind.hexTintColor`). */
    val thumbnailColor: String,
    val width: Int?,
    val height: Int?,
    val durationSeconds: Int?,
    val fileName: String?,
    val fileSizeLabel: String?,
    val pageCount: Int?,
    /** Légende descendue par le Prisme — l'original à son rang, jamais `translations.first`. */
    val caption: String?,
    /** Texte alternatif de l'auteur, servi tel quel. */
    val alt: String?,
    val transcription: MessageTranscription?,
    val translatedAudios: List<MessageTranslatedAudio>,
) {
    /** Largeur / hauteur, `null` si l'une des deux dimensions manque ou vaut zéro. */
    val aspectRatio: Double?
        get() = if (width != null && height != null && width > 0 && height > 0) width.toDouble() / height else null

    /** La durée « M:SS », `null` sans durée. */
    val durationLabel: String?
        get() = durationSeconds?.let { DurationFormat.clock(wholeSeconds = it) }

    /**
     * Ce que TalkBack lit : le texte alternatif de l'auteur, sinon la légende servie,
     * sinon `null` — l'appelant pose alors son libellé générique par type.
     */
    val accessibilityDescription: String?
        get() = alt?.trim()?.takeIf { it.isNotEmpty() } ?: caption?.trim()?.takeIf { it.isNotEmpty() }

    /** La hauteur de ce média pour une carte de [cardWidth], bornée par le ratio. */
    fun fittedHeight(cardWidth: Float): Float =
        PostMediaFraming.fittedMediaHeight(width, height, cardWidth)
}

internal object FeedMediaMapper {

    /**
     * Les médias du post, dans l'ordre serveur, plafonnés à [MAX_POST_MEDIA]. Un
     * média sans URL n'a rien à rendre et est écarté AVANT le plafond.
     */
    fun map(
        media: List<ApiPostMedia>?,
        preferredLanguages: List<String>,
        mediaBaseUrl: String?,
    ): List<FeedMediaItem> = media.orEmpty()
        .filter { !it.fileUrl.isNullOrBlank() }
        .sortedBy { it.order ?: Int.MAX_VALUE }
        .take(MAX_POST_MEDIA)
        .map { item(it, preferredLanguages, mediaBaseUrl) }

    private fun item(
        media: ApiPostMedia,
        preferredLanguages: List<String>,
        mediaBaseUrl: String?,
    ) = FeedMediaItem(
        id = media.id,
        type = typeOf(media.mimeType),
        url = resolveFeedMediaUrl(media.fileUrl!!, mediaBaseUrl),
        thumbnailUrl = media.thumbnailUrl?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
        thumbHash = media.thumbHash,
        thumbnailColor = AttachmentKind.fromMime(media.mimeType).hexTintColor,
        width = media.width,
        height = media.height,
        durationSeconds = media.duration?.let { it / 1000 },
        fileName = media.originalName ?: media.fileName,
        fileSizeLabel = media.fileSize?.let(::fileSizeLabel),
        pageCount = null,
        caption = media.resolvedCaption(preferredLanguages),
        alt = media.alt,
        transcription = media.transcription?.let { transcription(media.id, it) },
        translatedAudios = translatedAudios(media, mediaBaseUrl),
    )

    /** Un MIME absent retombe sur l'image : le fil est image par défaut (iOS `mediaType`). */
    fun typeOf(mimeType: String?): FeedMediaType {
        if (mimeType.isNullOrEmpty()) return FeedMediaType.IMAGE
        return when (AttachmentKind.fromMime(mimeType)) {
            AttachmentKind.IMAGE -> FeedMediaType.IMAGE
            AttachmentKind.VIDEO -> FeedMediaType.VIDEO
            AttachmentKind.AUDIO -> FeedMediaType.AUDIO
            else -> FeedMediaType.DOCUMENT
        }
    }

    fun fileSizeLabel(bytes: Int): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1_048_576 -> String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0)
        else -> String.format(Locale.ROOT, "%.1f MB", bytes / 1_048_576.0)
    }

    private fun transcription(attachmentId: String, source: ApiAttachmentTranscription) = MessageTranscription(
        attachmentId = attachmentId,
        text = source.text ?: source.transcribedText.orEmpty(),
        language = source.language ?: "und",
        confidence = source.confidence,
        durationMs = source.durationMs,
        segments = source.segments.orEmpty().map {
            MessageTranscriptionSegment(text = it.text, startTime = it.startTime, endTime = it.endTime, speakerId = it.speakerId)
        },
        speakerCount = source.speakerCount,
    )

    private fun translatedAudios(media: ApiPostMedia, mediaBaseUrl: String?): List<MessageTranslatedAudio> =
        media.translations.orEmpty().mapNotNull { (language, track) ->
            val url = track.url?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            MessageTranslatedAudio(
                id = "${media.id}_$language",
                attachmentId = media.id,
                targetLanguage = language,
                url = resolveFeedMediaUrl(url, mediaBaseUrl),
                transcription = track.transcription.orEmpty(),
                durationMs = track.durationMs ?: 0,
                format = track.format ?: "mp3",
                cloned = track.cloned ?: false,
                quality = track.quality ?: 0.0,
                voiceModelId = track.voiceModelId,
                ttsModel = track.ttsModel ?: "xtts",
                segments = track.segments.orEmpty().map {
                    MessageTranscriptionSegment(text = it.text, startTime = it.startTime, endTime = it.endTime, speakerId = it.speakerId)
                },
            )
        }
}
