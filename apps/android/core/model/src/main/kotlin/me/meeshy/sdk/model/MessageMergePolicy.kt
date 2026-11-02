package me.meeshy.sdk.model

/**
 * Les mutations locales encore dans l'outbox, par identifiant de message — miroir de
 * `APIMessageUpsert.PendingMutations` (iOS). Un instantané serveur ne doit annuler ni une
 * édition, ni une suppression, ni une réaction, ni un épinglage qui n'ont pas encore atteint
 * la passerelle : il les ignorerait, et la bulle reviendrait en arrière sous les yeux du lecteur.
 */
data class PendingMessageMutations(
    val edits: Set<String> = emptySet(),
    val deletes: Set<String> = emptySet(),
    val reactions: Set<String> = emptySet(),
    val pins: Set<String> = emptySet(),
) {
    /** Les gardes qui s'appliquent au message [messageId]. */
    fun guardsFor(messageId: String): MessageMergeGuards = MessageMergeGuards(
        pendingEdit = messageId in edits,
        pendingDelete = messageId in deletes,
        pendingReaction = messageId in reactions,
        pendingPin = messageId in pins,
    )

    companion object {
        val NONE: PendingMessageMutations = PendingMessageMutations()
    }
}

/** Ce que la fusion doit protéger sur UN message (miroir de `APIMessageUpsert.MergeGuards`). */
data class MessageMergeGuards(
    val pendingEdit: Boolean = false,
    val pendingDelete: Boolean = false,
    val pendingReaction: Boolean = false,
    val pendingPin: Boolean = false,
)

/** Le message fusionné et le fait qu'il diffère de la copie locale : `false` ⇒ aucune écriture. */
data class MessageMergeOutcome(
    val message: ApiMessage,
    val changed: Boolean,
)

/**
 * Fusion CHAMP PAR CHAMP d'un message servi (REST, socket, notification) dans la copie déjà en
 * cache — miroir de `APIMessageUpsert+Merge.swift` et de `upsertMutatedFieldsEqual` (iOS).
 *
 * Trois lois, qui rendent la fusion idempotente (`merge(x, x)` rend `x`, `changed = false`) et
 * indépendante de l'ordre d'arrivée des trois canaux :
 *  1. **Rien ne régresse** : une édition plus ancienne (`editedAt`) ne remplace jamais une plus
 *     récente ; les compteurs de remise et de lecture ne descendent jamais ; une suppression,
 *     une vue unique ouverte, une échéance d'éphémère ne s'effacent jamais.
 *  2. **Un canal allégé n'efface pas un canal riche** : l'écho socket et la charge minimale d'une
 *     notification omettent des blocs (expéditeur, citation, pièces, lieu, métadonnées…) ; un bloc
 *     absent de la charge reçue garde la valeur en cache au lieu de la vider.
 *  3. **L'outbox a le dernier mot** tant qu'elle n'a pas livré : édition, suppression, réaction et
 *     épinglage en file gardent leur valeur locale ([MessageMergeGuards]).
 *
 * Restent faisant autorité dans la charge servie, parce qu'ils se vident légitimement : le
 * résumé des réactions et l'épinglage (hors garde).
 */
object MessageMergePolicy {

    /** Fusionne [incoming] dans [existing] sous [guards]. */
    fun merge(
        existing: ApiMessage,
        incoming: ApiMessage,
        guards: MessageMergeGuards = MessageMergeGuards(),
    ): MessageMergeOutcome {
        var next = incoming
        next = mergedEdit(next, existing, incoming, guards)
        next = mergedDeletion(next, existing, incoming, guards)
        next = mergedReceipts(next, existing, incoming)
        next = mergedReactions(next, existing, guards)
        next = mergedPin(next, existing, guards)
        next = mergedLightFields(next, existing, incoming)
        next = next.copy(attachments = mergedAttachments(existing.attachments, incoming.attachments))
        return MessageMergeOutcome(message = next, changed = next != existing)
    }

    /**
     * Une édition plus récente déjà en cache, ou une édition encore en file, garde le texte, ses
     * traductions et son horodatage. Sinon le texte servi l'emporte, et ses traductions s'unissent
     * aux traductions arrivées par la socket (la charge servie gagne langue par langue).
     */
    private fun mergedEdit(
        next: ApiMessage,
        existing: ApiMessage,
        incoming: ApiMessage,
        guards: MessageMergeGuards,
    ): ApiMessage {
        if (guards.pendingEdit || guards.pendingDelete || isOlderEdit(incoming, existing)) {
            return next.copy(
                content = existing.content,
                isEdited = existing.isEdited,
                editedAt = existing.editedAt,
                translations = existing.translations,
            )
        }
        val sameRevision = incoming.editedAt == existing.editedAt && incoming.content == existing.content
        val translations = if (sameRevision) {
            unionTranslations(incoming.translations, existing.translations)
        } else {
            incoming.translations
        }
        return next.copy(isEdited = incoming.isEdited || (sameRevision && existing.isEdited), translations = translations)
    }

    /** `true` quand la charge reçue porte une révision antérieure à celle en cache. */
    private fun isOlderEdit(incoming: ApiMessage, existing: ApiMessage): Boolean {
        val held = isoToEpochMillisOrNull(existing.editedAt) ?: return false
        val served = isoToEpochMillisOrNull(incoming.editedAt) ?: return true
        return served < held
    }

    private fun unionTranslations(
        served: List<ApiTextTranslation>,
        cached: List<ApiTextTranslation>,
    ): List<ApiTextTranslation> {
        if (cached.isEmpty()) return served
        val servedLanguages = served.map { it.targetLanguage.lowercase() }.toSet()
        return served + cached.filter { it.targetLanguage.lowercase() !in servedLanguages }
    }

    /** Une suppression ne s'annule jamais ; une suppression en file garde la pierre tombale locale. */
    private fun mergedDeletion(
        next: ApiMessage,
        existing: ApiMessage,
        incoming: ApiMessage,
        guards: MessageMergeGuards,
    ): ApiMessage {
        val deletedAt = if (guards.pendingDelete) {
            existing.deletedAt ?: incoming.deletedAt
        } else {
            incoming.deletedAt ?: existing.deletedAt
        }
        if (deletedAt == null) return next
        if (incoming.deletedAt != null && !guards.pendingDelete) return next.copy(deletedAt = deletedAt)
        // La pierre tombale locale l'emporte sur une charge qui l'ignore encore : ni texte ni
        // traduction ne ressuscitent (la rétention est un invariant de sécurité).
        return next.copy(deletedAt = deletedAt, content = existing.content, translations = existing.translations)
    }

    /** Remise et lecture : jamais en arrière, quel que soit le canal le plus lent. */
    private fun mergedReceipts(next: ApiMessage, existing: ApiMessage, incoming: ApiMessage): ApiMessage =
        next.copy(
            deliveredCount = maxOf(existing.deliveredCount, incoming.deliveredCount),
            readCount = maxOf(existing.readCount, incoming.readCount),
            deliveredToAllAt = incoming.deliveredToAllAt ?: existing.deliveredToAllAt,
            readByAllAt = incoming.readByAllAt ?: existing.readByAllAt,
            recipientCount = incoming.recipientCount ?: existing.recipientCount,
            viewOnceCount = maxOf(existing.viewOnceCount, incoming.viewOnceCount),
            consumedByMe = if (existing.consumedByMe == true) true else incoming.consumedByMe ?: existing.consumedByMe,
        )

    private fun mergedReactions(next: ApiMessage, existing: ApiMessage, guards: MessageMergeGuards): ApiMessage =
        if (!guards.pendingReaction) {
            next
        } else {
            next.copy(
                reactionSummary = existing.reactionSummary,
                currentUserReactions = existing.currentUserReactions,
                reactionCount = existing.reactionCount,
            )
        }

    private fun mergedPin(next: ApiMessage, existing: ApiMessage, guards: MessageMergeGuards): ApiMessage =
        if (!guards.pendingPin) next else next.copy(pinnedAt = existing.pinnedAt, pinnedBy = existing.pinnedBy)

    /** Les blocs qu'un canal allégé omet : absent de la charge ⇒ la valeur en cache reste. */
    private fun mergedLightFields(next: ApiMessage, existing: ApiMessage, incoming: ApiMessage): ApiMessage =
        next.copy(
            senderId = incoming.senderId ?: existing.senderId,
            sender = incoming.sender ?: existing.sender,
            messageType = if (incoming.messageType == DEFAULT_TYPE) existing.messageType else incoming.messageType,
            originalLanguage = incoming.originalLanguage ?: existing.originalLanguage,
            createdAt = incoming.createdAt ?: existing.createdAt,
            updatedAt = latestInstant(incoming.updatedAt, existing.updatedAt),
            replyToId = incoming.replyToId ?: existing.replyToId,
            replyTo = incoming.replyTo ?: existing.replyTo,
            storyReplyToId = incoming.storyReplyToId ?: existing.storyReplyToId,
            postReplyTo = incoming.postReplyTo ?: existing.postReplyTo,
            clientMessageId = incoming.clientMessageId ?: existing.clientMessageId,
            forwardedFromId = incoming.forwardedFromId ?: existing.forwardedFromId,
            forwardedFromConversationId = incoming.forwardedFromConversationId
                ?: existing.forwardedFromConversationId,
            forwardedFromConversation = incoming.forwardedFromConversation ?: existing.forwardedFromConversation,
            forwardedFrom = incoming.forwardedFrom ?: existing.forwardedFrom,
            effectFlags = incoming.effectFlags ?: existing.effectFlags,
            isBlurred = incoming.isBlurred ?: existing.isBlurred,
            isViewOnce = incoming.isViewOnce ?: existing.isViewOnce,
            expiresAt = incoming.expiresAt ?: existing.expiresAt,
            ephemeralDuration = incoming.ephemeralDuration ?: existing.ephemeralDuration,
            messageSource = incoming.messageSource ?: existing.messageSource,
            location = incoming.location ?: existing.location,
            sticker = incoming.sticker ?: existing.sticker,
            isEncrypted = incoming.isEncrypted ?: existing.isEncrypted,
            encryptionMode = incoming.encryptionMode ?: existing.encryptionMode,
            encryptedContent = incoming.encryptedContent ?: existing.encryptedContent,
            mentionedUsers = incoming.mentionedUsers ?: existing.mentionedUsers,
            metadata = incoming.metadata ?: existing.metadata,
            systemEvent = incoming.systemEvent ?: existing.systemEvent,
            trackingLinks = incoming.trackingLinks ?: existing.trackingLinks,
        )

    /**
     * Les pièces servies l'emportent ; une charge sans pièce garde celles du cache. Une pièce servie
     * sans adresse (fichier ou vignette) reprend l'adresse locale de sa jumelle en cache — le chemin
     * du fichier que l'envoi optimiste a posé — par identifiant, sinon par rang à nombre égal.
     */
    private fun mergedAttachments(
        cached: List<ApiMessageAttachment>,
        served: List<ApiMessageAttachment>,
    ): List<ApiMessageAttachment> {
        if (served.isEmpty()) return cached
        if (cached.isEmpty()) return served
        val cachedById = cached.associateBy { it.id }
        return served.mapIndexed { index, attachment ->
            val twin = cachedById[attachment.id] ?: cached.getOrNull(index)?.takeIf { cached.size == served.size }
            if (twin == null) {
                attachment
            } else {
                attachment.copy(
                    fileUrl = attachment.fileUrl.takeUnless { it.isNullOrBlank() } ?: twin.fileUrl,
                    thumbnailUrl = attachment.thumbnailUrl.takeUnless { it.isNullOrBlank() } ?: twin.thumbnailUrl,
                )
            }
        }
    }

    private fun latestInstant(served: String?, cached: String?): String? {
        val servedMillis = isoToEpochMillisOrNull(served) ?: return cached ?: served
        val cachedMillis = isoToEpochMillisOrNull(cached) ?: return served
        return if (servedMillis >= cachedMillis) served else cached
    }

    private const val DEFAULT_TYPE = "text"
}
