package me.meeshy.ui.component.bubble

import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.JoinNoticePresentation
import me.meeshy.sdk.model.MessageSenderIdentity
import me.meeshy.sdk.model.ReactionSummaryReconstruction
import me.meeshy.sdk.model.sourceKind
import me.meeshy.sdk.model.SystemNoticeText
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.model.isEndToEndBlob
import me.meeshy.sdk.model.piece.MessagePieceTarget
import me.meeshy.sdk.model.EndToEndRegimeMemory
import me.meeshy.sdk.model.BlurRevealLifecycle
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.StickerPicture
import me.meeshy.sdk.model.DeliveryStatusResolver
import me.meeshy.sdk.model.ForwardAttribution
import me.meeshy.sdk.model.ForwardBadgePolicy
import me.meeshy.sdk.model.ForwardReference
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffectRenderPlanner
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.DeliveryTier
import me.meeshy.sdk.model.SendLifecycle
import me.meeshy.sdk.model.SendLifecycleResolver
import me.meeshy.sdk.model.exitOffer
import me.meeshy.sdk.model.PlainSignalAdmission
import me.meeshy.sdk.model.isProtected
import me.meeshy.sdk.model.VoiceQueueProtection
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.from
import me.meeshy.sdk.theme.DynamicColorGenerator

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
        /** Langue d'interface du lecteur pour les avis système ; défaut : `systemLanguage`, puis l'appareil. */
        readerLanguage: String? = null,
        /** Fuseau IANA du lecteur pour l'heure d'un avis de capture ; défaut : celui de l'appareil. */
        readerTimeZoneId: String? = null,
        /** Mon identité de session : l'écho allégé de MON message (sans expéditeur imbriqué) n'a pas de nom vide. */
        sessionIdentity: MessageSenderIdentity.Session? = null,
        /**
         * Couture inerte tant que le rendu du scellé n'est pas câblé : vrai, une vue unique non ouverte par CE lecteur
         * ne porte ni texte, ni légende, ni pièce (iOS `viewOnceSealed`).
         */
        sealUnopenedViewOnce: Boolean = false,
    ): BubbleContent {
        val isDeleted = message.deletedAt != null
        val viewOnceSealed = sealUnopenedViewOnce && BubbleKindBuilder.isViewOnceSealed(message, isDeleted)
        // #13106 — un blob chiffré de bout en bout scelle la bulle entière, même servie en clair.
        val isEndToEndSealed = !isDeleted && (message.isEndToEndSealed || message.attachments.any { it.isEndToEndBlob })
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
        val reactions = ReactionSummaryReconstruction
            .reconstruct(message.reactionSummary, ownReactions)
            .map { ReactionEntry(emoji = it.emoji, count = it.count, includesMe = it.includesMe) }
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
        val visibleAttachments = if (isDeleted || isEndToEndSealed || viewOnceSealed) emptyList() else message.attachments
        val attachments = BubbleAttachmentBuilder.build(
            visibleAttachments = visibleAttachments,
            effects = message.effects,
            preferences = preferences,
            mediaBaseUrl = mediaBaseUrl,
            displayDensity = displayDensity,
            contactScope = ContactCardResolutionScope.of(message),
        )
        val messagePlace = message.location
            ?.takeUnless { isDeleted || isEndToEndSealed || viewOnceSealed }
            ?.let { BubbleLocation.fromPlace(message.id, it) }
        // Une pièce qui disparaît (vue unique, floue, éphémère) ou que la loi de sortie retient ne s'ouvre ni ne se
        // télécharge : sa rangée ne promet rien (#13492) — le même verdict que l'aperçu et le contrôleur.
        val protectedIds = message.attachments.filter { MessagePieceTarget.isProtected(it, message) }.mapTo(HashSet()) { it.id }
        val files = attachments.files.map { if (it.attachmentId in protectedIds) it.copy(isProtected = true) else it }
        // Un vocal est protégé si son message OU sa pièce l'est (leçon 275) : rien sur le disque, aucune onde, aucun transfert.
        val protectedVoiceIds = message.attachments.filter { VoiceQueueProtection.ofPiece(it, message) }.mapTo(HashSet()) { it.id }
        val audios = attachments.audios.map { if (it.attachmentId in protectedVoiceIds) it.copy(isProtected = true) else it }
        // Un avis système (capture, arrivées) se compose CHEZ LE LECTEUR, dans sa langue et son fuseau ;
        // une métadonnée qui ne se lit pas retombe sur le `content` (repli français). Jamais une bulle.
        val noticeText = if (isDeleted || isEndToEndSealed || viewOnceSealed) {
            null
        } else {
            SystemNoticeText.of(
                message = message,
                language = readerLanguage ?: preferences.systemLanguage ?: preferences.deviceLocale
                    ?: Locale.getDefault().language,
                timeZoneId = readerTimeZoneId ?: ZoneId.systemDefault().id,
            )
        }
        val text = when {
            noticeText != null -> noticeText
            isDeleted || isEndToEndSealed || viewOnceSealed -> ""
            activeIsOriginal -> message.content
            else -> message.translations
                .firstOrNull {
                    it.targetLanguage.normalizedCode() == activeCode && it.translatedContent.isNotBlank()
                }
                ?.translatedContent
                ?: message.displayContent(preferences)
        }
        val languageStrip = if (isDeleted || viewOnceSealed) {
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
        val identity = MessageSenderIdentity.resolve(
            sender = message.sender,
            source = message.sourceKind,
            isMe = isOutgoing,
            session = sessionIdentity,
        )
        val senderName = (message.sender?.displayName ?: message.sender?.username)
            ?.takeIf { it.isNotBlank() }
            ?: identity.name.takeIf { message.sender == null }
        return BubbleContent(
            messageId = message.id,
            viewingConversationId = message.conversationId.takeIf { it.isNotBlank() },
            text = text,
            isOutgoing = isOutgoing,
            isTranslated = isTranslated,
            isShowingOriginal = isShowingOriginal,
            originalText = if (isTranslated && !isShowingOriginal && !viewOnceSealed) message.content else null,
            languageStrip = languageStrip,
            primaryLanguageCode = preferredCode ?: originalCode,
            secondaryTexts = secondaryTexts(languageStrip, message.translations),
            senderName = senderName,
            showSenderName = showSenderName && !isOutgoing,
            senderId = message.senderId,
            senderProfile = if (isOutgoing || message.isSystemMessage) null else ProfileSheetUser.from(message),
            senderUsername = identity.username,
            senderAvatarUrl = identity.avatarUrl,
            senderIsAnonymous = identity.isAnonymous,
            senderHasAccount = identity.hasAccount,
            senderRing = identity.avatarRing,
            sourceKind = message.sourceKind,
            servedMentionNames = if (isDeleted || isEndToEndSealed || viewOnceSealed) emptyMap() else servedMentionNames(message),
            senderColorHex = (senderName ?: message.senderId)?.let(DynamicColorGenerator::colorForName),
            isEdited = message.isEdited,
            isDeleted = isDeleted,
            isEndToEndSealed = isEndToEndSealed,
            isEndToEndOpened = !isDeleted && !isEndToEndSealed && EndToEndRegime.isEndToEnd(message.encryptionMode),
            isReadByServer = PlainSignalAdmission.rowReadByServer(message),
            sealedPieceIds = if (isEndToEndSealed && !isDeleted) message.attachments.map { it.id } else emptyList(),
            holdsEndToEndSend = isEndToEndSealed || EndToEndRegimeMemory.messageHoldsSend(message),
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
            images = attachments.images.map { if (it.attachmentId in protectedIds) it.copy(isProtected = true) else it },
            files = files,
            locations = listOfNotNull(messagePlace) + attachments.locations,
            audios = audios,
            emojiOnlyCount = if (visibleAttachments.isEmpty()) {
                EmojiDetector.emojiOnlyCount(text)
            } else {
                0
            },
            expiresAtIso = if (isDeleted) null else message.expiresAt?.trim()?.ifBlank { null },
            pinnedAtIso = if (isDeleted) null else message.pinnedAt?.trim()?.ifBlank { null },
            isForwarded = !isDeleted && !message.forwardedFromId.isNullOrBlank(),
            // Qui a le droit d'être nommé sous un transfert : trois issues (groupe, personne, personne)
            // décidées par `ForwardBadgePolicy` (iOS `ForwardReference` → `ForwardAttribution`). Un
            // tombeau supprimé ne nomme jamais sa source.
            forwardAttribution = if (isDeleted) {
                ForwardAttribution.Anonymous
            } else {
                ForwardBadgePolicy.attribution(
                    message.forwardedFromConversation?.let { conv ->
                        ForwardReference(
                            senderName = message.forwardedFrom?.sender?.let { it.displayName ?: it.user?.displayName ?: it.username }.orEmpty(),
                            conversationName = conv.title ?: conv.identifier,
                            conversationType = conv.type,
                        )
                    },
                )
            },
            blurReveal = if (isDeleted || viewOnceSealed) null else buildBlurReveal(message.effects),
            // Visual-treatment effects (glow / pulse / rainbow / one-shot appearance)
            // fed to `Modifier.messageEffects` — lifecycle bits stripped, empty when
            // deleted (a tombstone never glows). The played-appearance gate is resolved
            // later at render time by `MessageEffectRenderPlanner.plan`.
            effects = MessageEffectRenderPlanner.renderEffects(message.effects, isDeleted),
            // View-once burned tombstone inputs — consumed PER READER, like iOS
            // `isViewOnceOpened` (#7579): never the global `viewOnceCount`, which another
            // member's opening raises. A deleted tombstone takes precedence (its own path).
            isViewOnce = !isDeleted && message.effects.has(MessageEffectFlags.VIEW_ONCE),
            isAfterRead = !isDeleted && message.effects.has(MessageEffectFlags.EPHEMERAL_AFTER_READ),
            isViewOnceOpenedByMe = !isDeleted && message.isViewOnceOpenedByMe,
            // A conversation notice (join/leave/legacy summary) renders as a centered
            // notice, never a signed bubble — resolved FIRST in `BubbleRenderKind`.
            isSystem = message.isSystemMessage,
            joinNotice = message.joinNotice?.takeIf { message.isSystemMessage && !isDeleted }
                ?.let(JoinNoticePresentation::of),
            isArrivalsNotice = message.isSystemMessage && message.arrivalsNotice != null,
            videoCount = files.count { it.isVideo },
            contactCards = attachments.contactCards,
            isBlurred = !isDeleted && message.effects.has(MessageEffectFlags.BLURRED),
            exitOffer = message.exitOffer(),
            replyToIsMe = !replyToDeleted && currentUserId != null &&
                message.replyTo?.senderId == currentUserId,
            replyToAuthor = quotedAuthorProfile(message.replyTo, quoted?.senderName, currentUserId),
            replyToAudio = quoted?.audio,
            isSlowSend = isOutgoing && isSlowSend,
            sticker = if (isDeleted || isEndToEndSealed || viewOnceSealed) null else stickerOf(message, visibleAttachments, attachments.images),
            videos = attachments.videos,
            attachmentLayout = BubbleKindBuilder.layout(visibleAttachments.filterNot { it.isEndToEndBlob }),
            protection = BubbleKindBuilder.protection(message),
            isViewOnceSealed = viewOnceSealed,
            callSummary = message.callSummary?.takeIf { message.isSystemMessage && !isDeleted },
            callIsOutgoing = message.callSummary?.isOutgoing(currentUserId.orEmpty()) == true,
        )
    }

    /** Les noms servis pour les mentions : une mention d'un absent du roster affiche pourtant son nom. */
    private fun servedMentionNames(message: ApiMessage): Map<String, String> =
        message.mentionedUsers.orEmpty()
            .mapNotNull { user ->
                val name = user.displayName?.takeIf { it.isNotBlank() && it != user.username }
                if (user.username.isBlank() || name == null) null else user.username to name
            }
            .toMap()

    /** Le sticker et la PREMIÈRE image jointe, à l'adresse servie (iOS `resolveSticker`) ; rien sur un message masqué. */
    private fun stickerOf(
        message: ApiMessage,
        visibleAttachments: List<ApiMessageAttachment>,
        images: List<BubbleImage>,
    ): BubbleStickerSpec? {
        if (message.servedSticker == null) return null
        val first = visibleAttachments.firstOrNull { it.mimeType?.startsWith("image/") == true }
        val picture = first?.let { attachment -> images.firstOrNull { it.attachmentId == attachment.id } }
            ?.let { StickerPicture(fileUrl = it.url, thumbnailUrl = it.thumbnailUrl) }
        return BubbleStickerSpec.resolve(message.servedSticker, picture)
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
                    recipientCount = message.recipientCount?.takeIf { it > 0 } ?: recipientCount,
                    deliveredToAllAt = message.deliveredToAllAt,
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

    /** `langue -> texte` des langues du pied qui portent un contenu : la matière du panneau secondaire. */
    private fun secondaryTexts(
        strip: List<LanguageChip>,
        translations: List<LanguageResolver.TranslationLike>,
    ): Map<String, String> {
        val offered = strip.filter { !it.isTranslatable && !it.isOriginal }.map { it.code }.toSet()
        if (offered.isEmpty()) return emptyMap()
        return translations
            .filter { it.translatedContent.isNotBlank() && it.targetLanguage.normalizedCode() in offered }
            .associate { it.targetLanguage.normalizedCode().orEmpty() to it.translatedContent }
    }
}
