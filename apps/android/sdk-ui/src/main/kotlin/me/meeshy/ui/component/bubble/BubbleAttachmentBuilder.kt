package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ImageVariantPicker
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.isProtected
import me.meeshy.sdk.util.resolveMediaUrl

/** The attachments of one message, projected per rendered kind. */
internal class BubbleAttachments(
    val images: List<BubbleImage>,
    val files: List<BubbleFile>,
    val locations: List<BubbleLocation>,
    val audios: List<BubbleAudio>,
    val contactCards: List<BubbleContactCard>,
)

/**
 * Projects a message's visible attachments into the bubble's per-kind lists (the "pièces" half
 * of [BubbleContentBuilder]): images with their lightest covering preview, shared locations,
 * Prisme-resolved voice notes, generic files and contact cards.
 */
internal object BubbleAttachmentBuilder {

    /** Largeur (dp) de la case d'une image SEULE dans la bulle — celle de `BubbleImageGrid`. */
    private const val SOLO_IMAGE_WIDTH_DP = 252

    /** Largeur (dp) d'une case de la grille de 2 à 4 images — celle de `BubbleImageGrid`. */
    private const val GRID_IMAGE_CELL_WIDTH_DP = 124

    fun build(
        visibleAttachments: List<ApiMessageAttachment>,
        effects: MessageEffects,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        displayDensity: Float,
    ): BubbleAttachments {
        val files = visibleAttachments
            .filterNot { it.isImage || it.isLocation || it.isAudio }
            .map { attachment ->
                BubbleFile(
                    attachmentId = attachment.id,
                    name = attachment.originalName ?: attachment.fileName,
                    sizeBytes = attachment.fileSize,
                    url = attachment.fileUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                    isVideo = attachment.isVideo,
                    isContactCard = attachment.isContactCard,
                )
            }
        return BubbleAttachments(
            images = buildImages(visibleAttachments, effects, mediaBaseUrl, displayDensity),
            files = files,
            locations = visibleAttachments
                .filter { it.isLocation }
                .map { attachment ->
                    BubbleLocation(
                        attachmentId = attachment.id,
                        latitude = attachment.latitude,
                        longitude = attachment.longitude,
                        placeName = attachment.originalName?.trim()?.ifBlank { null },
                    )
                },
            audios = visibleAttachments
                .filter { it.isAudio }
                .map { attachment -> buildAudio(attachment, preferences, mediaBaseUrl) },
            contactCards = visibleAttachments
                .filter { it.isContactCard }
                .map { attachment ->
                    BubbleContactCard(
                        attachmentId = attachment.id,
                        name = (attachment.originalName ?: attachment.fileName)
                            ?.trim()?.removeSuffix(".vcf")?.ifBlank { null },
                    )
                },
        )
    }

    private fun buildImages(
        visibleAttachments: List<ApiMessageAttachment>,
        effects: MessageEffects,
        mediaBaseUrl: String?,
        displayDensity: Float,
    ): List<BubbleImage> {
        val imageAttachments = visibleAttachments.filter { it.isImage && it.fileUrl != null }
        // La vignette d'une bulle est la plus petite variante qui COUVRE la case, jamais
        // l'original multi-Mo. Un message flouté ou à vue unique garde ses URL d'avant :
        // aucune URL de plus ne part pour un contenu protégé.
        val previewWidthPx = ImageVariantPicker.displayWidthPx(
            widthDp = if (imageAttachments.size == 1) SOLO_IMAGE_WIDTH_DP else GRID_IMAGE_CELL_WIDTH_DP,
            density = displayDensity,
        )
        val lighterPreviewsAllowed = imageAttachments.isNotEmpty() &&
            !effects.has(MessageEffectFlags.BLURRED) &&
            !effects.has(MessageEffectFlags.VIEW_ONCE)
        return imageAttachments
            .map { attachment ->
                val lighterPreview = if (lighterPreviewsAllowed) attachment.lighterPreviewUrl(previewWidthPx) else null
                BubbleImage(
                    attachmentId = attachment.id,
                    url = resolveMediaUrl(attachment.fileUrl!!, mediaBaseUrl),
                    thumbnailUrl = (lighterPreview ?: attachment.thumbnailUrl)
                        ?.let { resolveMediaUrl(it, mediaBaseUrl) },
                    width = attachment.width,
                    height = attachment.height,
                    alt = attachment.alt?.trim()?.ifBlank { null },
                )
            }
    }

    /**
     * Projects an audio attachment into a [BubbleAudio], resolving the displayed
     * transcription through the Prisme Linguistique — port of iOS `AudioPlayerView`
     * transcription handling, but done at build time so the viewer sees the
     * preferred-language transcription by default (iOS defaults to the original and
     * requires a manual language pick; this surpasses it).
     *
     * The duration falls back to the transcription's `durationMs` when the
     * attachment carries no explicit `duration`, matching the gateway's two sources.
     * Both are milliseconds (`MessageAttachment.duration`, packages/shared/prisma/schema.prisma).
     */
    private fun buildAudio(
        attachment: ApiMessageAttachment,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
    ): BubbleAudio {
        val resolved = resolveTranscription(attachment, preferences)
        val translatedAudio = resolveTranslatedAudio(attachment, preferences)
        val playableUrl = translatedAudio?.url ?: attachment.fileUrl
        val durationSeconds = translatedAudio?.durationMs?.let { it / 1000 }
            ?: attachment.duration?.let { it / 1000 }
            ?: attachment.transcription?.durationMs?.let { it / 1000 }
        return BubbleAudio(
            attachmentId = attachment.id,
            url = playableUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
            durationSeconds = durationSeconds,
            sizeBytes = attachment.fileSize,
            transcriptionText = resolved?.text,
            transcriptionLanguage = resolved?.language,
            isTranscriptionTranslated = resolved?.isTranslated == true,
            isAudioTranslated = translatedAudio != null,
            audioLanguage = translatedAudio?.language ?: resolved?.language,
        )
    }

    private data class ResolvedTranscription(
        val text: String,
        val language: String?,
        val isTranslated: Boolean,
    )

    private data class ResolvedAudio(
        val url: String,
        val language: String,
        val durationMs: Int?,
    )

    /**
     * Prisme rule 1 for the audio source: prefer a cloned-voice translation targeting one
     * of the viewer's preferred languages (in priority order). When the highest-priority
     * preferred language is the attachment's original transcription language the original
     * voice wins (returns null) — never an arbitrary translation. Returns null when no
     * preferred-language translation carries a playable audio url, in which case the
     * caller falls back to the original voice note. Mirrors [resolveTranscription] so the
     * played voice and the surfaced transcription line resolve to the same language.
     */
    private fun resolveTranslatedAudio(
        attachment: ApiMessageAttachment,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): ResolvedAudio? {
        val originalLanguage = attachment.transcription?.language?.trim()?.ifBlank { null }
        val translations = attachment.translations.orEmpty()

        for (language in LanguageResolver.preferredContentLanguages(preferences)) {
            if (originalLanguage != null && originalLanguage.equals(language, ignoreCase = true)) {
                return null
            }
            val translated = translations.entries
                .firstOrNull { it.key.equals(language, ignoreCase = true) }
                ?.value
            val url = translated?.url?.trim()?.ifBlank { null }
            if (url != null) return ResolvedAudio(url, language, translated.durationMs)
        }
        return null
    }

    /**
     * Prisme rule 1: prefer a translation targeting one of the viewer's preferred
     * languages (in priority order); when the original transcription is already in
     * a preferred language it wins as untranslated content; otherwise fall back to
     * the ORIGINAL transcription (never an arbitrary translation). Returns null when
     * no non-blank transcription exists at all.
     */
    private fun resolveTranscription(
        attachment: ApiMessageAttachment,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): ResolvedTranscription? {
        val transcription: ApiAttachmentTranscription? = attachment.transcription
        val originalText = (transcription?.transcribedText ?: transcription?.text)
            ?.trim()?.ifBlank { null }
        val originalLanguage = transcription?.language?.trim()?.ifBlank { null }
        val translations = attachment.translations.orEmpty()

        for (language in LanguageResolver.preferredContentLanguages(preferences)) {
            if (originalText != null && originalLanguage.equals(language, ignoreCase = true)) {
                return ResolvedTranscription(originalText, originalLanguage, isTranslated = false)
            }
            val translated = translations.entries
                .firstOrNull { it.key.equals(language, ignoreCase = true) }
                ?.value?.transcription?.trim()?.ifBlank { null }
            if (translated != null) {
                return ResolvedTranscription(translated, language, isTranslated = true)
            }
        }
        return originalText?.let { ResolvedTranscription(it, originalLanguage, isTranslated = false) }
    }

    /**
     * L'URL de la variante WebP d'aperçu quand elle est plus légère que l'original, `null`
     * sinon. Une image chiffrée n'a pas de variante ; une pièce qui n'a pas PROUVÉ qu'elle
     * est ordinaire (vue unique, floutée, ou muette sur sa protection) garde ses URL d'avant.
     */
    private fun ApiMessageAttachment.lighterPreviewUrl(targetWidthPx: Int): String? {
        if (isEncrypted == true || isProtected) return null
        return ImageVariantPicker.lighterPreviewUrl(imageVariants, fileUrl.orEmpty(), width, targetWidthPx)
    }

    private const val LOCATION_MIME = "application/x-location"

    private val ApiMessageAttachment.isImage: Boolean
        get() = mimeType?.startsWith("image/") == true

    private val ApiMessageAttachment.isLocation: Boolean
        get() = mimeType == LOCATION_MIME

    private val ApiMessageAttachment.isVideo: Boolean
        get() = mimeType?.startsWith("video/") == true

    private val ApiMessageAttachment.isContactCard: Boolean
        get() = mimeType?.lowercase() in VCARD_MIMES ||
            (originalName ?: fileName)?.lowercase()?.endsWith(".vcf") == true

    private val VCARD_MIMES = setOf("text/vcard", "text/x-vcard", "text/directory")

    private val ApiMessageAttachment.isAudio: Boolean
        get() = mimeType?.startsWith("audio/") == true
}
