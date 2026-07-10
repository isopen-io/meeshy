package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiPostReplyTarget
import me.meeshy.sdk.model.DeliveryStatusResolver
import me.meeshy.sdk.model.DeliveryTier

public object BubbleContentBuilder {

    public fun build(
        message: ApiMessage,
        currentUserId: String?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        showSenderName: Boolean = false,
        isPending: Boolean = false,
        isFailed: Boolean = false,
        ownReactions: Set<String> = emptySet(),
        showOriginal: Boolean = false,
        mediaBaseUrl: String? = null,
        recipientCount: Int = 0,
    ): BubbleContent {
        val isDeleted = message.deletedAt != null
        val isOutgoing = currentUserId != null && message.senderId == currentUserId
        val isTranslated = !isDeleted && message.isTranslated(preferences)
        val isShowingOriginal = isTranslated && showOriginal
        val deliveryStatus = when {
            !isOutgoing -> DeliveryStatus.Sent
            isFailed -> DeliveryStatus.Failed
            isPending -> DeliveryStatus.Pending
            else -> when (
                DeliveryStatusResolver.resolve(
                    deliveredCount = message.deliveredCount,
                    readCount = message.readCount,
                    recipientCount = recipientCount,
                    readByAllAt = message.readByAllAt,
                )
            ) {
                DeliveryTier.Read -> DeliveryStatus.Read
                DeliveryTier.Delivered -> DeliveryStatus.Delivered
                DeliveryTier.Sent -> DeliveryStatus.Sent
            }
        }
        val reactions = message.reactionSummary
            ?.map { (emoji, count) ->
                ReactionEntry(emoji = emoji, count = count, includesMe = emoji in ownReactions)
            }
            ?: emptyList()
        val replyToDeleted = message.replyTo?.deletedAt != null
        val replyToText = message.replyTo?.content?.takeUnless { replyToDeleted }
        val replyAttachments = if (replyToDeleted) emptyList() else message.replyTo?.attachments.orEmpty()
        val replyImage = replyAttachments.firstOrNull { it.isImage }
        val replyToMediaKind = when {
            replyImage != null -> ReplyMediaKind.Image
            replyAttachments.isNotEmpty() -> ReplyMediaKind.File
            else -> ReplyMediaKind.None
        }
        val replyToThumbnailUrl = replyImage
            ?.let { it.thumbnailUrl ?: it.fileUrl }
            ?.let { resolveMediaUrl(it, mediaBaseUrl) }
        // Story/mood-reply preview. A message reply (`replyTo`) takes precedence,
        // and a deleted tombstone carries no metadata (mirrors the pinnedAtIso /
        // isForwarded suppress rules) — so it only surfaces on a live message
        // that quotes a post but not another message.
        val storyReply = when {
            isDeleted -> null
            message.replyTo != null -> null
            else -> buildStoryReply(message.postReplyTo, message.storyReplyToId, mediaBaseUrl)
        }
        val visibleAttachments = if (isDeleted) emptyList() else message.attachments
        val images = visibleAttachments
            .filter { it.isImage && it.fileUrl != null }
            .map { attachment ->
                BubbleImage(
                    attachmentId = attachment.id,
                    url = resolveMediaUrl(attachment.fileUrl!!, mediaBaseUrl),
                    thumbnailUrl = attachment.thumbnailUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                    width = attachment.width,
                    height = attachment.height,
                )
            }
        val locations = visibleAttachments
            .filter { it.isLocation }
            .map { attachment ->
                BubbleLocation(
                    attachmentId = attachment.id,
                    latitude = attachment.latitude,
                    longitude = attachment.longitude,
                    placeName = attachment.originalName?.trim()?.ifBlank { null },
                )
            }
        val audios = visibleAttachments
            .filter { it.isAudio }
            .map { attachment ->
                buildAudio(attachment, preferences, mediaBaseUrl)
            }
        val files = visibleAttachments
            .filterNot { it.isImage || it.isLocation || it.isAudio }
            .map { attachment ->
                BubbleFile(
                    attachmentId = attachment.id,
                    name = attachment.originalName ?: attachment.fileName,
                    sizeBytes = attachment.fileSize,
                )
            }
        val text = when {
            isDeleted -> ""
            isShowingOriginal -> message.content
            else -> message.displayContent(preferences)
        }
        val languageStrip = if (isDeleted) {
            emptyList()
        } else {
            MessageLanguageStrip.build(
                originalLanguage = message.originalLanguage,
                translations = message.translations,
                preferences = preferences,
                showingOriginal = isShowingOriginal,
            )
        }
        return BubbleContent(
            messageId = message.id,
            text = text,
            isOutgoing = isOutgoing,
            isTranslated = isTranslated,
            isShowingOriginal = isShowingOriginal,
            originalText = if (isTranslated && !isShowingOriginal) message.content else null,
            languageStrip = languageStrip,
            senderName = (message.sender?.displayName ?: message.sender?.username)
                ?.takeIf { it.isNotBlank() },
            showSenderName = showSenderName && !isOutgoing,
            isEdited = message.isEdited,
            isDeleted = isDeleted,
            createdAtIso = message.createdAt,
            deliveryStatus = deliveryStatus,
            reactions = reactions,
            replyToId = message.replyTo?.id,
            replyToText = replyToText,
            replyToDeleted = replyToDeleted,
            replyToMediaKind = replyToMediaKind,
            replyToThumbnailUrl = replyToThumbnailUrl,
            storyReply = storyReply,
            replyToSenderName = message.replyTo?.senderDisplayName,
            isPending = isPending,
            clientMessageId = message.clientMessageId,
            images = images,
            files = files,
            locations = locations,
            audios = audios,
            emojiOnlyCount = if (visibleAttachments.isEmpty()) {
                EmojiDetector.emojiOnlyCount(text)
            } else {
                0
            },
            pinnedAtIso = if (isDeleted) null else message.pinnedAt?.trim()?.ifBlank { null },
            isForwarded = !isDeleted && !message.forwardedFromId.isNullOrBlank(),
        )
    }

    /**
     * Projects the quoted post/story into a [BubbleStoryReply] — port of the
     * `postReplyTo` / `storyReplyToId` branch of iOS `APIMessage → ReplyReference`.
     * A non-blank `moodEmoji` yields a mood preview (emoji + text); otherwise a
     * story preview (thumbnail + metrics). A bare `storyReplyToId` with no
     * snapshot yields a metadata-less story preview. Returns null when neither
     * a snapshot nor a story id is present.
     */
    private fun buildStoryReply(
        target: ApiPostReplyTarget?,
        storyReplyToId: String?,
        mediaBaseUrl: String?,
    ): BubbleStoryReply? {
        if (target != null) {
            val moodEmoji = target.moodEmoji?.trim()?.ifBlank { null }
            if (moodEmoji != null) {
                return BubbleStoryReply(
                    previewText = target.previewText,
                    moodEmoji = moodEmoji,
                )
            }
            return BubbleStoryReply(
                previewText = target.previewText,
                reactionCount = target.reactionCount,
                commentCount = target.commentCount,
                shareCount = target.shareCount,
                thumbnailUrl = target.thumbnailUrl
                    ?.takeIf { it.isNotBlank() }
                    ?.let { resolveMediaUrl(it, mediaBaseUrl) },
            )
        }
        if (!storyReplyToId.isNullOrBlank()) {
            return BubbleStoryReply()
        }
        return null
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
     */
    private fun buildAudio(
        attachment: ApiMessageAttachment,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
    ): BubbleAudio {
        val durationSeconds = attachment.duration
            ?: attachment.transcription?.durationMs?.let { it / 1000 }
        val resolved = resolveTranscription(attachment, preferences)
        return BubbleAudio(
            attachmentId = attachment.id,
            url = attachment.fileUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
            durationSeconds = durationSeconds,
            sizeBytes = attachment.fileSize,
            transcriptionText = resolved?.text,
            transcriptionLanguage = resolved?.language,
            isTranscriptionTranslated = resolved?.isTranslated == true,
        )
    }

    private data class ResolvedTranscription(
        val text: String,
        val language: String?,
        val isTranslated: Boolean,
    )

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

    private const val LOCATION_MIME = "application/x-location"

    private val ApiMessageAttachment.isImage: Boolean
        get() = mimeType?.startsWith("image/") == true

    private val ApiMessageAttachment.isLocation: Boolean
        get() = mimeType == LOCATION_MIME

    private val ApiMessageAttachment.isAudio: Boolean
        get() = mimeType?.startsWith("audio/") == true

    private fun resolveMediaUrl(url: String, mediaBaseUrl: String?): String = when {
        url.startsWith("http") -> url
        mediaBaseUrl == null -> url
        else -> mediaBaseUrl.trimEnd('/') + (if (url.startsWith("/")) url else "/$url")
    }
}
