package me.meeshy.sdk.model

/**
 * Les deltas LOCAUX qu'un événement du fil applique à un message en cache, sans aller au réseau
 * (miroir des écritures `MessagePersistenceActor` que `ConversationSocketHandler` déclenche, iOS).
 *
 * Fonctions pures : chacune rend le message transformé, ou l'INSTANCE REÇUE quand l'événement ne
 * change rien — l'appelant saute alors l'écriture Room, donc le fil ne recompose pas et la bulle
 * ne saute pas.
 */
object ConversationEventDeltas {

    /**
     * Suppression pour tous : la bulle devient une pierre tombale — contenu et traductions
     * effacés (la rétention est un invariant de sécurité), pièces retirées.
     */
    fun deleted(message: ApiMessage, deletedAtIso: String): ApiMessage {
        val alreadyTombstone = message.deletedAt != null && message.content.isEmpty() &&
            message.translations.isEmpty() && message.attachments.isEmpty()
        if (alreadyTombstone) return message
        return message.copy(
            content = "",
            translations = emptyList(),
            attachments = emptyList(),
            deletedAt = message.deletedAt ?: deletedAtIso,
        )
    }

    /** Épingle posée ([pinnedAtIso], [pinnedBy]) ou retirée (`null`, `null`). */
    fun pinned(message: ApiMessage, pinnedAtIso: String?, pinnedBy: String?): ApiMessage {
        if (message.pinnedAt == pinnedAtIso && message.pinnedBy == pinnedBy) return message
        return message.copy(pinnedAt = pinnedAtIso, pinnedBy = pinnedBy)
    }

    /**
     * L'échéance SERVIE d'un éphémère. Chez un destinataire elle CONCOURT avec l'échéance locale
     * et la plus PROCHE gagne (aucune source n'a le droit de prolonger la vie d'un message protégé) ;
     * chez l'EXPÉDITEUR elle est la seule horloge et REMPLACE (`max D(u)`, #8905).
     * Une échéance servie illisible ne touche à rien.
     */
    fun servedDeadline(message: ApiMessage, servedIso: String, viewerIsSender: Boolean): ApiMessage {
        val served = isoToEpochMillisOrNull(servedIso) ?: return message
        val current = isoToEpochMillisOrNull(message.expiresAt)
        val keepCurrent = !viewerIsSender && current != null && current <= served
        if (keepCurrent || message.expiresAt == servedIso) return message
        return message.copy(expiresAt = servedIso)
    }

    /**
     * Une vue unique ouverte par quelqu'un (#7579) : seul le compteur bouge chez les autres ; quand
     * c'est CE lecteur qui l'a ouverte (autre appareil), la bulle passe à « déjà ouverte ».
     */
    fun consumed(message: ApiMessage, event: MessageConsumedEvent, viewerId: String?): ApiMessage {
        val openedByViewer = viewerId != null && (event.userId == viewerId || event.participantId == viewerId)
        val nextConsumedByMe = if (openedByViewer) true else message.consumedByMe
        if (message.viewOnceCount == event.viewOnceCount && message.consumedByMe == nextConsumedByMe) return message
        return message.copy(viewOnceCount = event.viewOnceCount, consumedByMe = nextConsumedByMe)
    }

    /**
     * Le CONTENU d'une vue unique est purgé (#7578) : texte, traductions, média, vignette,
     * transcription et traductions audio disparaissent ; la bulle et son état « ouvert » restent.
     */
    fun viewOncePurged(message: ApiMessage): ApiMessage {
        val purgedAttachments = message.attachments.map { it.purgedContent() }
        if (message.content.isEmpty() && message.translations.isEmpty() && purgedAttachments == message.attachments) {
            return message
        }
        return message.copy(content = "", translations = emptyList(), attachments = purgedAttachments)
    }

    /** Le résumé AUTORITAIRE des réactions d'une pièce (`attachment:reaction-*`) remplace le local. */
    fun attachmentReactions(message: ApiMessage, attachmentId: String, summary: Map<String, Int>?): ApiMessage {
        val normalized = summary?.filterValues { it > 0 }?.ifEmpty { null }
        return message.updatingAttachment(attachmentId) { attachment ->
            if (attachment.reactionSummary == normalized) attachment else attachment.copy(reactionSummary = normalized)
        }
    }

    /**
     * Réaction OPTIMISTE de ce lecteur sur une pièce : le compte bouge de ±1 et « ma réaction » suit.
     * Le retour arrière est le geste inverse ([adding] opposé), pas la restauration d'un instantané :
     * un delta serveur arrivé entre-temps n'est pas écrasé.
     */
    fun attachmentReactionToggled(message: ApiMessage, attachmentId: String, emoji: String, adding: Boolean): ApiMessage =
        message.updatingAttachment(attachmentId) { attachment ->
            val mine = attachment.currentUserReactions.orEmpty()
            if (adding == (emoji in mine)) return@updatingAttachment attachment
            val counts = attachment.reactionSummary.orEmpty()
            val nextCount = (counts[emoji] ?: 0) + if (adding) 1 else -1
            val nextSummary = (counts + (emoji to nextCount)).filterValues { it > 0 }.ifEmpty { null }
            val nextMine = (if (adding) mine + emoji else mine - emoji).ifEmpty { null }
            attachment.copy(reactionSummary = nextSummary, currentUserReactions = nextMine)
        }

    private inline fun ApiMessage.updatingAttachment(
        attachmentId: String,
        transform: (ApiMessageAttachment) -> ApiMessageAttachment,
    ): ApiMessage {
        val index = attachments.indexOfFirst { it.id == attachmentId }
        if (index < 0) return this
        val current = attachments[index]
        val next = transform(current)
        if (next == current) return this
        return copy(attachments = attachments.toMutableList().also { it[index] = next })
    }

    private fun ApiMessageAttachment.purgedContent(): ApiMessageAttachment {
        val purged = copy(
            fileUrl = null,
            thumbnailUrl = null,
            thumbHash = null,
            imageVariants = null,
            transcription = null,
            translations = null,
        )
        return if (purged == this) this else purged
    }
}
