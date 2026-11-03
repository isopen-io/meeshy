package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.isDirect
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.preview.PreviewFieldUpdate
import me.meeshy.sdk.model.preview.previewTruncated

/**
 * Les règles PURES du patch en place d'une ligne de liste : une trame socket se plie dans la ligne
 * qu'elle concerne, sans relire la liste. Chaque règle rend `null` quand la trame ne change RIEN
 * (pas d'écriture Room, pas de recomposition). Miroir de `ConversationStoreMergeRules.merging`
 * (iOS), seul site où le cache disque et l'écran s'accordent sur ce qu'une trame veut dire.
 */
object ConversationLivePatch {

    /** Plafond du compteur de membres servi à un lecteur non administrateur (« 199+ »). */
    const val MEMBER_COUNT_CAP: Int = 199

    /**
     * `conversation:updated` : métadonnées, groupe « dernier message », réaction, appel, rang.
     * Le titre d'un direct ne se renomme jamais (le nom d'une ligne directe est celui de l'autre).
     */
    fun applyUpdated(
        conversation: ApiConversation,
        event: ConversationUpdatedSocketEvent,
        readerId: String?,
        youLabel: String,
    ): ApiConversation? {
        val merged = conversation
            .withPreviewGroup(event, readerId, youLabel)
            .withActivity(event)
            .withMetadata(event)
        return merged.takeUnless { it == conversation }
    }

    /** `conversation:unread-updated` : le compteur absolu du serveur. */
    fun applyUnread(conversation: ApiConversation, unreadCount: Int): ApiConversation? =
        unreadCount.coerceAtLeast(0).let { count ->
            if (count == conversation.unreadCount) null else conversation.copy(unreadCount = count)
        }

    /**
     * Effectif de membres. La valeur absolue du serveur est prioritaire (un delta ne converge pas
     * après un événement manqué) ; sinon le delta s'ajoute sans jamais dépasser le plafond d'un
     * compteur déjà plafonné ni descendre sous zéro.
     */
    fun applyMemberCount(
        conversation: ApiConversation,
        delta: Int = 0,
        absolute: Int? = null,
        capped: Boolean? = null,
    ): ApiConversation? {
        val current = conversation.memberCount
        val next = when {
            absolute != null -> absolute
            conversation.memberCountCapped == true && delta > 0 && current >= MEMBER_COUNT_CAP -> current
            else -> current + delta
        }.coerceAtLeast(0)
        val nextCapped = when {
            capped != null -> capped
            absolute != null -> conversation.memberCountCapped
            else -> conversation.memberCountCapped
        }
        val patched = conversation.copy(serverMemberCount = next, memberCountCapped = nextCapped)
        return patched.takeUnless { it == conversation }
    }

    /** Le rang de la ligne en millisecondes : rang servi, sinon dernier message, sinon mise à jour. */
    fun rankMillis(conversation: ApiConversation): Long =
        isoToEpochMillisOrNull(conversation.listRankAt)
            ?: isoToEpochMillisOrNull(conversation.lastMessage?.createdAt)
            ?: isoToEpochMillisOrNull(conversation.updatedAt)
            ?: isoToEpochMillisOrNull(conversation.createdAt)
            ?: 0L

    private fun ApiConversation.withPreviewGroup(
        event: ConversationUpdatedSocketEvent,
        readerId: String?,
        youLabel: String,
    ): ApiConversation {
        val incomingAt = isoToEpochMillisOrNull(event.lastMessageAt)
        val knownAt = isoToEpochMillisOrNull(lastMessage?.createdAt)
        val isCurrent = incomingAt == null || knownAt == null || incomingAt >= knownAt
        if (!isCurrent && !event.previewRecalculated) return this
        if (event.lastMessageId == PreviewFieldUpdate.Replaced<String>(null)) return clearingLastMessage()
        val namedId = (event.lastMessageId as? PreviewFieldUpdate.Replaced<String>)?.value
        val isNewMessage = namedId != null && namedId != lastMessage?.id
        var last = lastMessage
        if (namedId != null && isNewMessage) {
            last = ApiConversationLastMessage(id = namedId, createdAt = last?.createdAt, location = event.location)
        }
        event.lastMessageAt?.let { last = (last ?: ApiConversationLastMessage()).copy(createdAt = it) }
        event.lastMessagePreview?.let { last = (last ?: ApiConversationLastMessage()).copy(content = it.previewTruncated()) }
        last = last?.withAuthor(event, readerId, youLabel, isNewMessage)
        last = last?.withMedia(event, namedId != null)
        val translations = (event.lastMessageTranslations as? PreviewFieldUpdate.Replaced<Map<String, String>>)
        return copy(
            lastMessage = last,
            lastMessageTranslations = if (translations != null) translations.value?.takeIf { it.isNotEmpty() } else lastMessageTranslations,
            lastMessageOriginalLanguage = if (translations != null) event.lastMessageOriginalLanguage else lastMessageOriginalLanguage,
        )
    }

    private fun ApiConversationLastMessage.withAuthor(
        event: ConversationUpdatedSocketEvent,
        readerId: String?,
        youLabel: String,
        isNewMessage: Boolean,
    ): ApiConversationLastMessage {
        val authorUserId = event.lastMessageSenderUserId ?: event.senderId
        val mine = !readerId.isNullOrBlank() && (event.lastMessageSenderUserId == readerId || event.senderId == readerId)
        val served = event.lastMessageSenderName as? PreviewFieldUpdate.Replaced<String>
        val name = when {
            mine -> youLabel
            served != null -> served.value
            isNewMessage -> null
            else -> return this
        }
        val peerId = if (mine || name == null) null else authorUserId
        return copy(senderName = name, senderId = peerId)
    }

    private fun ApiConversationLastMessage.withMedia(
        event: ConversationUpdatedSocketEvent,
        namesMessage: Boolean,
    ): ApiConversationLastMessage {
        if (!namesMessage) return this
        val nature = event.lastMessageNature
        val withMedia = if (event.lastMessageAttachments != null || event.lastMessageAttachmentCount != null) {
            copy(
                attachments = event.lastMessageAttachments,
                count = event.lastMessageAttachmentCount?.let { me.meeshy.sdk.model.ApiMessageCount(attachments = it) },
                isBlurred = event.lastMessageIsBlurred ?: false,
                isViewOnce = event.lastMessageIsViewOnce ?: false,
                expiresAt = event.lastMessageExpiresAt,
            )
        } else {
            this
        }
        return if (nature == null) {
            withMedia
        } else {
            withMedia.copy(
                messageType = nature.messageType,
                effectFlags = nature.effectFlags,
                ephemeralDuration = nature.ephemeralDuration,
                isEncrypted = nature.isEncrypted,
                isForwarded = nature.isForwarded,
                systemEvent = nature.systemEvent,
                callSummary = nature.callSummary,
                attachmentSummary = nature.attachmentSummary,
                sticker = nature.sticker,
            )
        }
    }

    private fun ApiConversation.withActivity(event: ConversationUpdatedSocketEvent): ApiConversation {
        var next = this
        (event.lastReaction as? PreviewFieldUpdate.Replaced)?.let { next = next.copy(lastReaction = it.value) }
        (event.activeCall as? PreviewFieldUpdate.Replaced)?.let { next = next.copy(activeCall = it.value) }
        val rank = isoToEpochMillisOrNull(event.listRankAt)
        val knownRank = isoToEpochMillisOrNull(listRankAt) ?: Long.MIN_VALUE
        if (rank != null && rank > knownRank) next = next.copy(listRankAt = event.listRankAt)
        return next
    }

    private fun ApiConversation.withMetadata(event: ConversationUpdatedSocketEvent): ApiConversation =
        copy(
            title = event.title?.takeUnless { isDirect } ?: title,
            avatar = event.avatar ?: avatar,
            description = event.description ?: description,
            banner = event.banner ?: banner,
            isAnnouncementChannel = event.isAnnouncementChannel ?: isAnnouncementChannel,
            defaultWriteRole = event.defaultWriteRole ?: defaultWriteRole,
            slowModeSeconds = event.slowModeSeconds ?: slowModeSeconds,
            autoTranslateEnabled = event.autoTranslateEnabled ?: autoTranslateEnabled,
        )
}
