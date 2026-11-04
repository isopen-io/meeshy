package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.AttachmentTranscriptPrism
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ImageVariantPicker
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.isEndToEndBlob
import me.meeshy.sdk.model.piece.PieceSealing
import me.meeshy.sdk.model.isProtected
import me.meeshy.sdk.util.resolveMediaUrl

/** The attachments of one message, projected per rendered kind. */
internal class BubbleAttachments(
    val images: List<BubbleImage>,
    val files: List<BubbleFile>,
    val locations: List<BubbleLocation>,
    val audios: List<BubbleAudio>,
    val contactCards: List<BubbleContactCard>,
    val videos: List<BubbleVideo> = emptyList(),
)

/**
 * Projects a message's visible attachments into the bubble's per-kind lists (the "pièces" half
 * of [BubbleContentBuilder]): images with their lightest covering preview, shared locations,
 * Prisme-resolved voice notes, generic files and contact cards.
 */
internal object BubbleAttachmentBuilder {

    /** Largeur (dp) de la case d'une image SEULE dans la bulle — celle de `BubbleImageGrid`. */
    private const val SOLO_IMAGE_WIDTH_DP = 252
    private const val MAX_TILE_EMOJIS = 3

    /** Largeur (dp) d'une case de la grille de 2 à 4 images — celle de `BubbleImageGrid`. */
    private const val GRID_IMAGE_CELL_WIDTH_DP = 124

    fun build(
        visibleAttachments: List<ApiMessageAttachment>,
        effects: MessageEffects,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        displayDensity: Float,
        contactScope: ContactCardResolutionScope = ContactCardResolutionScope.Unknown,
    ): BubbleAttachments {
        // #13106 — un blob chiffré de bout en bout n'est aucun genre de pièce : ni nom, ni lien.
        val openable = visibleAttachments.filterNot { it.isEndToEndBlob }
        return project(openable, effects, preferences, mediaBaseUrl, displayDensity, contactScope)
    }

    private fun project(
        visibleAttachments: List<ApiMessageAttachment>,
        effects: MessageEffects,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        displayDensity: Float,
        contactScope: ContactCardResolutionScope,
    ): BubbleAttachments {
        val files = visibleAttachments
            .filterNot { it.isImage || it.isLocation || it.isAudio }
            .map { attachment ->
                val sealed = PieceSealing.isSealed(attachment)
                BubbleFile(
                    attachmentId = attachment.id,
                    name = if (sealed) null else attachment.originalName ?: attachment.fileName,
                    sizeBytes = if (sealed) null else attachment.fileSize,
                    url = if (sealed) null else attachment.fileUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                    isVideo = attachment.isVideo,
                    isContactCard = attachment.isContactCard && !sealed,
                    isSealed = sealed,
                    isOnDevice = attachment.fileUrl.isLocalUri(),
                    contactScope = if (attachment.isContactCard) contactScope.sealedBy(attachment) else ContactCardResolutionScope.Unknown,
                    thumbnailUrl = if (sealed) null else attachment.thumbnailUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                    width = if (sealed) null else attachment.width,
                    height = if (sealed) null else attachment.height,
                    mimeType = if (sealed) null else attachment.mimeType,
                    pageCount = if (sealed) null else attachment.pageCount,
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
            videos = visibleAttachments
                .filter { it.isVideo && !it.isContactCard && !PieceSealing.isSealed(it) }
                .map { attachment ->
                    BubbleVideo(
                        attachmentId = attachment.id,
                        url = attachment.fileUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                        thumbnailUrl = attachment.thumbnailUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                        width = attachment.width,
                        height = attachment.height,
                        durationSeconds = attachment.duration?.let { it / 1000 },
                        sizeBytes = attachment.fileSize,
                        isProtected = attachment.isProtected,
                        isOnDevice = attachment.fileUrl.isLocalUri() || attachment.awaitsUpload,
                        servedConsumption = attachment.currentUserConsumption,
                        isBlurred = attachment.declaresBlur,
                        isViewOnce = attachment.declaresViewOnce,
                        viewOnceCount = attachment.viewOnceCount ?: 0,
                    )
                },
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
        val imageAttachments = visibleAttachments.filter { it.isImage && it.paintableUrl != null }
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
            .mapNotNull { attachment ->
                val paintable = attachment.paintableUrl ?: return@mapNotNull null
                val lighterPreview = if (lighterPreviewsAllowed) attachment.lighterPreviewUrl(previewWidthPx) else null
                BubbleImage(
                    attachmentId = attachment.id,
                    url = resolveMediaUrl(paintable, mediaBaseUrl),
                    thumbnailUrl = (lighterPreview ?: attachment.thumbnailUrl)
                        ?.let { resolveMediaUrl(it, mediaBaseUrl) },
                    width = attachment.width,
                    height = attachment.height,
                    alt = attachment.alt?.trim()?.ifBlank { null },
                    reactionLabel = if (lighterPreviewsAllowed && attachment.showsItsContent()) tileReactionLabel(attachment.reactionSummary) else null,
                    sizeBytes = attachment.fileSize?.toLong(),
                    isBlurred = attachment.declaresBlur,
                    isViewOnce = attachment.declaresViewOnce,
                    viewOnceCount = attachment.viewOnceCount ?: 0,
                )
            }
    }

    /** Le flou déclaré par la pièce : son drapeau booléen OU le bit du bitfield (les canaux sont un OU). */
    private val ApiMessageAttachment.declaresBlur: Boolean
        get() = isBlurred == true || MessageEffectFlags.has(effectFlags ?: 0L, MessageEffectFlags.BLURRED)

    private val ApiMessageAttachment.declaresViewOnce: Boolean
        get() = isViewOnce == true || MessageEffectFlags.has(effectFlags ?: 0L, MessageEffectFlags.VIEW_ONCE)

    /** Une pièce à vue unique, floutée ou à effets ne montre rien d'elle, réactions comprises. */
    private fun ApiMessageAttachment.showsItsContent(): Boolean =
        isViewOnce != true && isBlurred != true && (effectFlags ?: 0L) == 0L && isEncrypted != true

    /** Les trois emojis les plus posés, puis le total s'il dépasse un : « 👍❤️ 3 » ; `null` sans réaction. */
    internal fun tileReactionLabel(summary: Map<String, Int>?): String? {
        val posted = summary.orEmpty().entries.filter { it.value > 0 }
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
        if (posted.isEmpty()) return null
        val total = posted.sumOf { it.value }
        val emojis = posted.take(MAX_TILE_EMOJIS).joinToString("") { it.key }
        return if (total > 1) "$emojis $total" else emojis
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
            ?.takeIf { track -> resolved == null || (resolved.isTranslated && resolved.language.equals(track.language, ignoreCase = true)) }
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
            transcriptionSegments = servedSegments(attachment, resolved, playedLanguage = translatedAudio?.language),
            lastPlayPositionMs = attachment.currentUserConsumption?.lastPlayPositionMs,
            listenedComplete = attachment.currentUserConsumption?.listenedComplete == true,
            originalLanguage = attachment.transcription?.language?.trim()?.ifBlank { null },
            translatedLanguages = attachment.translations.orEmpty()
                .filter { (_, track) -> !track.url.isNullOrBlank() }
                .keys.map { it.trim() }.filter { it.isNotEmpty() },
        )
    }

    /**
     * Les segments du texte servi (#13878) : ceux de la transcription d'origine, ou ceux de la traduction servie. Leurs
     * horodatages ne valent que sur la piste qu'ils décrivent ; servis au-dessus d'une autre voix, ils les perdent et le
     * karaoké avance à la progression plutôt que d'allumer un mot à contretemps.
     */
    private fun servedSegments(
        attachment: ApiMessageAttachment,
        served: AttachmentTranscriptPrism.Served?,
        playedLanguage: String?,
    ): List<MessageTranscriptionSegment> {
        served ?: return emptyList()
        val segments = if (served.isTranslated) {
            attachment.translations.orEmpty().entries.firstOrNull { it.key.equals(served.language, ignoreCase = true) }?.value?.segments
        } else {
            attachment.transcription?.segments
        }
        val describesPlayedTrack = if (served.isTranslated) served.language.equals(playedLanguage, ignoreCase = true) else playedLanguage == null
        return segments.orEmpty().mapNotNull { segment ->
            segment.text.trim().ifBlank { null }?.let { text ->
                MessageTranscriptionSegment(
                    text = text,
                    startTime = segment.startTime.takeIf { describesPlayedTrack },
                    endTime = segment.endTime.takeIf { describesPlayedTrack },
                    speakerId = segment.speakerId,
                )
            }
        }
    }

    /**
     * The played voice: [AttachmentTranscriptPrism.track], the SAME single Prisme descent as the
     * transcription line next to it, so the voice and the text are always in one language. Null
     * means the original voice note.
     */
    private fun resolveTranslatedAudio(
        attachment: ApiMessageAttachment,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): AttachmentTranscriptPrism.Track? =
        AttachmentTranscriptPrism.track(attachment.transcription, attachment.translations, preferences)

    /** The Prisme-served transcription line — [AttachmentTranscriptPrism], the site the transcription fiche reads too. */
    private fun resolveTranscription(
        attachment: ApiMessageAttachment,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): AttachmentTranscriptPrism.Served? =
        AttachmentTranscriptPrism.served(attachment.transcription, attachment.translations, preferences)

    /**
     * L'URL de la variante WebP d'aperçu quand elle est plus légère que l'original, `null`
     * sinon. Une image chiffrée n'a pas de variante ; une pièce qui n'a pas PROUVÉ qu'elle
     * est ordinaire (vue unique, floutée, ou muette sur sa protection) garde ses URL d'avant.
     */
    private fun ApiMessageAttachment.lighterPreviewUrl(targetWidthPx: Int): String? {
        if (isEncrypted == true || isProtected) return null
        return ImageVariantPicker.lighterPreviewUrl(imageVariants, fileUrl.orEmpty(), width, targetWidthPx)
    }

    /** Le fichier de l'image ; en attente d'envoi, ses octets scellés, l'aperçu local qui le remplace (#15104). */
    private val ApiMessageAttachment.paintableUrl: String?
        get() = fileUrl ?: thumbnailUrl?.takeIf { it.isLocalUri() }

    /** En attente d'envoi : ses octets sont scellés sur l'appareil, seul son aperçu local se lit (#15104). */
    private val ApiMessageAttachment.awaitsUpload: Boolean
        get() = fileUrl == null && thumbnailUrl.isLocalUri()

    private fun String?.isLocalUri(): Boolean = this != null && (startsWith("file://") || startsWith("content://"))

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
