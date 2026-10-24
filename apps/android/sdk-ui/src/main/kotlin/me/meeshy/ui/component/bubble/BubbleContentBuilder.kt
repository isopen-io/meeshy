package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.BlurRevealLifecycle
import me.meeshy.sdk.model.DeliveryStatusResolver
import me.meeshy.sdk.model.ForwardBadgePolicy
import me.meeshy.sdk.model.ForwardReference
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffectRenderPlanner
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.DeliveryTier
import me.meeshy.sdk.model.SendLifecycle
import me.meeshy.sdk.model.SendLifecycleResolver
import me.meeshy.sdk.model.exitOffer
import me.meeshy.sdk.model.isProtected

public object BubbleContentBuilder {

    /**
     * Densité d'écran de référence (xxhdpi) tant que l'appelant ne passe pas la vraie :
     * elle ne sert qu'à choisir la variante d'image d'aperçu, jamais à dessiner.
     */
    public const val DEFAULT_DISPLAY_DENSITY: Float = 3f

    public fun build(
        message: ApiMessage,
        currentUserId: String?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        showSenderName: Boolean = false,
        isPending: Boolean = false,
        isFailed: Boolean = false,
        ownReactions: Set<String> = emptySet(),
        showOriginal: Boolean = false,
        activeLanguageCode: String? = null,
        mediaBaseUrl: String? = null,
        recipientCount: Int = 0,
        showReadReceipts: Boolean = true,
        isOffline: Boolean = false,
        displayDensity: Float = DEFAULT_DISPLAY_DENSITY,
        isSlowSend: Boolean = false,
    ): BubbleContent {
        val isDeleted = message.deletedAt != null
        val isOutgoing = currentUserId != null && message.senderId == currentUserId
        val isTranslated = !isDeleted && message.isTranslated(preferences)
        // The active display language. A flag-tap `activeLanguageCode` override wins
        // (when it names a language the message actually carries), otherwise fall
        // back to the binary showOriginal toggle: original vs the preferred
        // translation (or original when no translation is preferred).
        val originalCode = message.originalLanguage.normalizedCode()
        val preferredCode = LanguageResolver
            .preferredTranslation(message.translations, preferences, message.originalLanguage)
            ?.targetLanguage?.normalizedCode()
        val requestedActive = activeLanguageCode.normalizedCode()
            ?.takeIf { it.hasContentIn(message, originalCode) }
        val activeCode = requestedActive
            ?: if (showOriginal) originalCode else (preferredCode ?: originalCode)
        val activeIsOriginal = activeCode == null || activeCode == originalCode
        val isShowingOriginal = isTranslated && activeIsOriginal
        val deliveryStatus = resolveDeliveryStatus(
            message = message,
            isOutgoing = isOutgoing,
            isPending = isPending,
            isFailed = isFailed,
            isOffline = isOffline,
            recipientCount = recipientCount,
            showReadReceipts = showReadReceipts,
        )
        val reactions = message.reactionSummary
            ?.map { (emoji, count) ->
                ReactionEntry(emoji = emoji, count = count, includesMe = emoji in ownReactions)
            }
            ?: emptyList()
        val quoted = BubbleQuotedReplyBuilder.build(message.replyTo, preferences, mediaBaseUrl)
        val replyToDeleted = quoted?.isDeleted == true
        // Story/mood-reply preview. A message reply (`replyTo`) takes precedence,
        // and a deleted tombstone carries no metadata (mirrors the pinnedAtIso /
        // isForwarded suppress rules) — so it only surfaces on a live message
        // that quotes a post but not another message.
        val storyReply = when {
            isDeleted -> null
            message.replyTo != null -> null
            else -> BubbleStoryReplyBuilder.build(message.postReplyTo, message.storyReplyToId, mediaBaseUrl)
        }
        val visibleAttachments = if (isDeleted) emptyList() else message.attachments
        val attachments = BubbleAttachmentBuilder.build(
            visibleAttachments = visibleAttachments,
            effects = message.effects,
            preferences = preferences,
            mediaBaseUrl = mediaBaseUrl,
            displayDensity = displayDensity,
        )
        val files = attachments.files
        val text = when {
            isDeleted -> ""
            activeIsOriginal -> message.content
            else -> message.translations
                .firstOrNull {
                    it.targetLanguage.normalizedCode() == activeCode && it.translatedContent.isNotBlank()
                }
                ?.translatedContent
                ?: message.displayContent(preferences)
        }
        val languageStrip = if (isDeleted) {
            emptyList()
        } else {
            MessageLanguageStrip.build(
                originalLanguage = message.originalLanguage,
                translations = message.translations,
                preferences = preferences,
                showingOriginal = isShowingOriginal,
                activeCodeOverride = activeCode,
                includeTranslatable = true,
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
            replyToText = quoted?.text,
            replyToDeleted = replyToDeleted,
            replyToMediaKind = quoted?.mediaKind ?: ReplyMediaKind.None,
            replyToThumbnailUrl = quoted?.thumbnailUrl,
            storyReply = storyReply,
            replyToSenderName = quoted?.senderName,
            isPending = isPending,
            clientMessageId = message.clientMessageId,
            images = attachments.images,
            files = files,
            locations = attachments.locations,
            audios = attachments.audios,
            emojiOnlyCount = if (visibleAttachments.isEmpty()) {
                EmojiDetector.emojiOnlyCount(text)
            } else {
                0
            },
            expiresAtIso = if (isDeleted) null else message.expiresAt?.trim()?.ifBlank { null },
            pinnedAtIso = if (isDeleted) null else message.pinnedAt?.trim()?.ifBlank { null },
            isForwarded = !isDeleted && !message.forwardedFromId.isNullOrBlank(),
            // Name the SOURCE conversation for a group forward (else null → the
            // generic "Forwarded" label). Mirrors iOS building a `ForwardReference`
            // from `forwardedFromConversation` (`title ?? identifier`, `type`), then
            // running `ForwardBadgePolicy`. A deleted tombstone never names a source.
            forwardedFromName = if (isDeleted) {
                null
            } else {
                ForwardBadgePolicy.conversationName(
                    message.forwardedFromConversation?.let { conv ->
                        ForwardReference(
                            conversationName = conv.title ?: conv.identifier,
                            conversationType = conv.type,
                        )
                    },
                )
            },
            blurReveal = if (isDeleted) null else buildBlurReveal(message.effects),
            // Visual-treatment effects (glow / pulse / rainbow / one-shot appearance)
            // fed to `Modifier.messageEffects` — lifecycle bits stripped, empty when
            // deleted (a tombstone never glows). The played-appearance gate is resolved
            // later at render time by `MessageEffectRenderPlanner.plan`.
            effects = MessageEffectRenderPlanner.renderEffects(message.effects, isDeleted),
            // View-once burned tombstone inputs — consumed PER READER, like iOS
            // `isViewOnceOpened` (#7579): never the global `viewOnceCount`, which another
            // member's opening raises. A deleted tombstone takes precedence (its own path).
            isViewOnce = !isDeleted && message.effects.has(MessageEffectFlags.VIEW_ONCE),
            isViewOnceOpenedByMe = !isDeleted && message.isViewOnceOpenedByMe,
            // A conversation notice (join/leave/legacy summary) renders as a centered
            // notice, never a signed bubble — resolved FIRST in `BubbleRenderKind`.
            isSystem = message.isSystemMessage,
            videoCount = files.count { it.isVideo },
            contactCards = attachments.contactCards,
            isBlurred = !isDeleted && message.effects.has(MessageEffectFlags.BLURRED),
            exitOffer = message.exitOffer(),
            replyToIsMe = !replyToDeleted && currentUserId != null &&
                message.replyTo?.senderId == currentUserId,
            isSlowSend = isOutgoing && isSlowSend,
        )
    }

    /** Sender-side delivery tier of an outgoing message; an incoming one always reads `Sent`. */
    private fun resolveDeliveryStatus(
        message: ApiMessage,
        isOutgoing: Boolean,
        isPending: Boolean,
        isFailed: Boolean,
        isOffline: Boolean,
        recipientCount: Int,
        showReadReceipts: Boolean,
    ): DeliveryStatus = when {
        !isOutgoing -> DeliveryStatus.Sent
        else -> when (
            SendLifecycleResolver.resolve(
                isPending = isPending,
                isFailed = isFailed,
                isOffline = isOffline,
            )
        ) {
            SendLifecycle.Failed -> DeliveryStatus.Failed
            SendLifecycle.QueuedOffline -> DeliveryStatus.QueuedOffline
            SendLifecycle.InFlight -> DeliveryStatus.Pending
            SendLifecycle.Settled -> when (
                DeliveryStatusResolver.resolve(
                    deliveredCount = message.deliveredCount,
                    readCount = message.readCount,
                    recipientCount = recipientCount,
                    readByAllAt = message.readByAllAt,
                    showReadReceipts = showReadReceipts,
                )
            ) {
                DeliveryTier.Read -> DeliveryStatus.Read
                DeliveryTier.Delivered -> DeliveryStatus.Delivered
                DeliveryTier.Sent -> DeliveryStatus.Sent
            }
        }
    }

    /**
     * Derives the "tap to reveal" conceal spec from a message's resolved
     * [MessageEffects] — parity with iOS gating `BubbleBlurRevealController` on
     * `effects.isBlurred || effects.isViewOnce`. Returns null (no conceal) when
     * neither lifecycle bit is set; a deleted tombstone never conceals. The
     * visibility window uses the message's `blurRevealDuration` param when present,
     * falling back to the shared default (iOS `effects.blurRevealDuration ??`).
     */
    private fun buildBlurReveal(effects: MessageEffects): BubbleBlurRevealSpec? {
        val isBlurred = effects.has(MessageEffectFlags.BLURRED)
        val isViewOnce = effects.has(MessageEffectFlags.VIEW_ONCE)
        if (!isBlurred && !isViewOnce) return null
        return BubbleBlurRevealSpec(
            isViewOnce = isViewOnce,
            visibilitySeconds = effects.blurRevealDuration
                ?: BlurRevealLifecycle.defaultRevealDurationSeconds,
        )
    }

    private fun String?.normalizedCode(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }

    /**
     * True when [this] normalized language code has renderable content in [message]
     * — either it is the original language or a translation targets it with
     * non-blank content. Mirrors `LanguageFlagTapResolver`'s has-content rule so a
     * flag-tap override can never point the bubble at an empty language.
     */
    private fun String.hasContentIn(message: ApiMessage, originalCode: String?): Boolean =
        this == originalCode || message.translations.any {
            it.targetLanguage.normalizedCode() == this && it.translatedContent.isNotBlank()
        }
}
