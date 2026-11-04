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

    /**
     * Le post cité par ce message a été retiré (`message:cited-post-withdrawn`, #7969) : sa citation
     * devient « indisponible » — l'identifiant seul survit, ni aperçu, ni vignette, ni humeur (iOS
     * `ReplyReference.unavailableStory`). Un message qui cite un AUTRE post, ou aucun, est rendu tel quel.
     */
    fun citedPostWithdrawn(message: ApiMessage, postId: String): ApiMessage {
        if (postId.isEmpty()) return message
        val cited = message.postReplyTo?.id == postId || (message.postReplyTo == null && message.storyReplyToId == postId)
        if (!cited || message.postReplyTo?.unavailable == true) return message
        return message.copy(postReplyTo = ApiPostReplyTarget(id = postId, unavailable = true))
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
     * c'est CE lecteur qui l'a ouverte (autre appareil), la bulle passe à « déjà ouverte » ET se scelle
     * comme à la purge ([sealedAsOpened], iso iOS `sealAsOpenedViewOnce`, #15897) : rien du contenu ne
     * reste lisible en Room une fois la vue consommée par soi. Un `consumed` d'un autre ne vide rien.
     */
    fun consumed(message: ApiMessage, event: MessageConsumedEvent, viewerId: String?): ApiMessage {
        val openedByViewer = viewerId != null && (event.userId == viewerId || event.participantId == viewerId)
        val base = if (openedByViewer) sealedAsOpened(message) else message
        if (base.viewOnceCount == event.viewOnceCount) return base
        return base.copy(viewOnceCount = event.viewOnceCount)
    }

    /**
     * Ce lecteur vient d'ouvrir (et de refermer) la vue unique : même scellement que [consumed] par soi, sans attendre
     * l'écho du serveur. Idempotent.
     */
    fun sealedAsOpened(message: ApiMessage): ApiMessage {
        val purged = viewOncePurged(message)
        return if (purged.consumedByMe == true) purged else purged.copy(consumedByMe = true)
    }

    /**
     * Le scellement que toute écriture d'une ligne doit rendre (#15897, iso iOS `APIMessageUpsert+Merge`) : une VUE UNIQUE
     * ([holdsViewOnce]) que ce lecteur a ouverte — la ligne le sait ([openedHere], colonne `viewOnceOpenedAt`) ou la
     * charge le dit (`consumedByMe`) — sort par [sealedAsOpened]. Tout autre message est rendu tel quel : un message
     * ordinaire n'est jamais vidé par une colonne d'ouverture posée à tort.
     */
    fun sealedIfOpened(message: ApiMessage, openedHere: Boolean): ApiMessage {
        val opened = openedHere || message.consumedByMe == true
        return if (opened && holdsViewOnce(message)) sealedAsOpened(message) else message
    }

    /** Le message est une vue unique, déclarée par lui (drapeau ou effet) ou par l'une de ses pièces. */
    fun holdsViewOnce(message: ApiMessage): Boolean =
        message.isViewOnce == true ||
            MessageEffectFlags.has((message.effectFlags ?: 0).toLong(), MessageEffectFlags.VIEW_ONCE) ||
            message.attachments.any { it.isViewOnce == true || MessageEffectFlags.has(it.effectFlags ?: 0L, MessageEffectFlags.VIEW_ONCE) }

    /**
     * Le CONTENU d'une vue unique est purgé (#7578) : texte, traductions, cryptogramme, lieu, sticker, liens suivis,
     * métadonnées, et par pièce le média, la vignette, la transcription, les traductions audio, le texte alternatif, le
     * nom de fichier et les coordonnées — tout ce que le serveur retient à un lecteur qui l'a ouverte
     * (`viewOnceAudience.ts` `WITHHELD_CONTENT`, iso iOS `sealAsOpenedViewOnce`, #15897). La bulle, son type, ses
     * drapeaux de protection et son état « ouvert » restent.
     */
    fun viewOncePurged(message: ApiMessage): ApiMessage {
        val purged = message.copy(
            content = "",
            translations = emptyList(),
            attachments = message.attachments.map { it.purgedContent() },
            encryptedContent = null,
            location = null,
            sticker = null,
            trackingLinks = null,
            metadata = null,
        )
        return if (purged == message) message else purged
    }

    /**
     * Le résumé AUTORITAIRE des réactions d'une pièce (`attachment:reaction-*`) remplace le local. [ownEmoji] est posé
     * quand l'auteur de l'événement EST ce lecteur (son `User.id`, depuis un autre appareil) : « ma réaction » suit.
     */
    fun attachmentReactions(
        message: ApiMessage,
        attachmentId: String,
        summary: Map<String, Int>?,
        ownEmoji: String? = null,
        ownAdding: Boolean = true,
    ): ApiMessage {
        val normalized = summary?.filterValues { it > 0 }?.ifEmpty { null }
        return message.updatingAttachment(attachmentId) { attachment ->
            val mine = attachment.currentUserReactions.orEmpty()
            val nextMine = when {
                ownEmoji.isNullOrEmpty() -> attachment.currentUserReactions
                ownAdding -> if (ownEmoji in mine) attachment.currentUserReactions else mine + ownEmoji
                else -> (mine - ownEmoji).ifEmpty { null }
            }
            if (attachment.reactionSummary == normalized && attachment.currentUserReactions == nextMine) attachment
            else attachment.copy(reactionSummary = normalized, currentUserReactions = nextMine)
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
            alt = null,
            originalName = null,
            fileName = null,
            latitude = null,
            longitude = null,
        )
        return if (purged == this) this else purged
    }
}
