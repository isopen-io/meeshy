package me.meeshy.sdk.model

/**
 * Ce que le temps réel d'une PIÈCE fait à la copie locale de son message, sans réseau (miroir de
 * `ConversationSocketHandler+MediaEvents`, iOS) : l'accusé de consommation (`attachment-status:updated`)
 * et l'enrichissement (`message:attachment-updated`, `attachment:ready`).
 *
 * Fonctions pures : chacune rend l'INSTANCE reçue quand l'événement ne change rien, donc l'appelant n'écrit
 * pas deux fois. Les mêmes barrières servent les deux : une adresse cohérente (même conversation, pièce
 * connue), un message vivant, et JAMAIS une écriture dans un message ou une pièce scellés de bout en bout
 * (aucune donnée du worker ne se pose en clair sur ce que cet appareil ne sait pas lire).
 */
object AttachmentLiveDeltas {

    private const val LISTENED = "listened"
    private const val WATCHED = "watched"
    private const val VIEWED = "viewed"
    private const val DOWNLOADED = "downloaded"

    /**
     * L'accusé de consommation d'une pièce.
     *  - C'est MOI (écho d'un autre appareil) : la progression du lecteur avance — position de reprise,
     *    complétion qui ne se reprend jamais.
     *  - C'est le seul AUTRE participant d'un tête-à-tête, sur l'action PRIMAIRE du média : il est toute
     *    l'audience, la pièce est « par tous » depuis cet événement (jamais pour l'auteur, jamais en
     *    groupe : un événement ne dit pas QUEL membre a rapporté, et créditer un rapport partiel comme
     *    « par tous » serait pire que se taire).
     */
    fun status(message: ApiMessage, event: AttachmentStatusUpdatedEvent, viewerId: String?): ApiMessage {
        val index = pieceIndex(message, event.conversationId, event.attachmentId)
        if (index < 0) return message
        val piece = message.attachments[index]
        val reporter = event.userId?.takeIf { it.isNotBlank() } ?: return message
        val next = if (reporter == viewerId) {
            piece.withOwnProgress(event)
        } else {
            piece.withConsumedByAll(message, event, reporter)
        }
        return message.replacing(index, piece, next)
    }

    /**
     * Le worker a enrichi la pièce (`message:attachment-updated`) ou fini son rendu (`attachment:ready`) :
     * adresse, vignette, dimensions, durée, transcription et pistes traduites arrivent dans la bulle.
     * Un champ que le worker n'a pas servi n'efface jamais ce que la bulle a ; les pistes traduites
     * SE JOIGNENT à celles déjà jouables (l'entrée servie gagne) ; les agrégats du serveur n'avancent que
     * vers l'avant. Ce qui est PERSONNEL (mes réactions, ma progression) et ce qui PROTÈGE (vue unique,
     * flou, effets) n'est jamais remplacé par une diffusion.
     *
     * Une vue unique CONSOMMÉE par moi ou PURGÉE ne revient jamais : la passerelle rejoue ces diffusions
     * depuis sa file hors ligne bien après la purge, et y répondre rendrait l'adresse, la vignette et la
     * transcription que la purge a détruites ([ConversationEventDeltas.viewOncePurged]).
     */
    fun enriched(message: ApiMessage, conversationId: String, attachmentId: String, incoming: ApiMessageAttachment): ApiMessage {
        val index = pieceIndex(message, conversationId, attachmentId)
        if (index < 0 || incoming.holdsCiphertext) return message
        val piece = message.attachments[index]
        if (message.viewOnceSpent(piece)) return message
        return message.replacing(index, piece, piece.enrichedBy(incoming))
    }

    /**
     * La purge ne laisse aucun drapeau : elle VIDE la pièce. Une vue unique est donc « épuisée » quand je l'ai
     * ouverte, ou quand la pièce n'a plus rien à montrer (ni adresse, ni vignette, ni transcription).
     */
    private fun ApiMessage.viewOnceSpent(piece: ApiMessageAttachment): Boolean {
        val viewOnce = piece.isViewOnce == true ||
            MessageEffectFlags.has(piece.effectFlags ?: 0L, MessageEffectFlags.VIEW_ONCE) ||
            effects.has(MessageEffectFlags.VIEW_ONCE)
        return viewOnce && (consumedByMe == true || piece.isEmptied)
    }

    private val ApiMessageAttachment.isEmptied: Boolean
        get() = fileUrl.isNullOrBlank() && thumbnailUrl.isNullOrBlank() && thumbHash.isNullOrBlank() &&
            imageVariants.isNullOrEmpty() && transcription == null && translations.isNullOrEmpty()

    private fun pieceIndex(message: ApiMessage, conversationId: String, attachmentId: String): Int {
        if (message.conversationId != conversationId || message.deletedAt != null || message.holdsCiphertext) return -1
        return message.attachments.indexOfFirst { it.id == attachmentId && !it.holdsCiphertext }
    }

    private fun ApiMessage.replacing(index: Int, current: ApiMessageAttachment, next: ApiMessageAttachment): ApiMessage {
        if (next == current) return this
        return copy(attachments = attachments.toMutableList().also { it[index] = next })
    }

    private fun ApiMessageAttachment.withOwnProgress(event: AttachmentStatusUpdatedEvent): ApiMessageAttachment {
        val position = event.playPositionMs?.toInt()
        val complete = event.complete == true
        val base = currentUserConsumption ?: MeeshyMediaConsumption()
        val next = when (event.action) {
            LISTENED -> base.copy(
                lastPlayPositionMs = position ?: base.lastPlayPositionMs,
                listenedComplete = base.listenedComplete || complete,
            )
            WATCHED -> base.copy(
                lastWatchPositionMs = position ?: base.lastWatchPositionMs,
                watchedComplete = base.watchedComplete || complete,
            )
            else -> return this
        }
        return if (next == currentUserConsumption) this else copy(currentUserConsumption = next)
    }

    private fun ApiMessageAttachment.withConsumedByAll(
        message: ApiMessage,
        event: AttachmentStatusUpdatedEvent,
        reporter: String,
    ): ApiMessageAttachment {
        val confirmedAt = event.updatedAt?.takeIf { it.isNotBlank() } ?: return this
        val author = listOfNotNull(message.senderId, message.sender?.resolvedUserId)
        val soleRecipient = message.recipientCount == 1 && reporter !in author
        if (!soleRecipient || event.action != primaryAction(mimeType)) return this
        return when (event.action) {
            VIEWED -> copy(viewedByAllAt = viewedByAllAt ?: confirmedAt, viewedCount = maxOf(viewedCount ?: 0, 1))
            DOWNLOADED -> copy(downloadedByAllAt = downloadedByAllAt ?: confirmedAt, downloadedCount = maxOf(downloadedCount ?: 0, 1))
            LISTENED -> copy(listenedByAllAt = listenedByAllAt ?: confirmedAt, consumedCount = maxOf(consumedCount ?: 0, 1))
            else -> copy(watchedByAllAt = watchedByAllAt ?: confirmedAt, consumedCount = maxOf(consumedCount ?: 0, 1))
        }
    }

    /** L'action qui compte pour un type de média : écouter un vocal, regarder une vidéo, voir une image, sinon télécharger. */
    private fun primaryAction(mimeType: String?): String {
        val type = mimeType.orEmpty()
        return when {
            type.startsWith("audio/") -> LISTENED
            type.startsWith("video/") -> WATCHED
            type.startsWith("image/") -> VIEWED
            else -> DOWNLOADED
        }
    }

    private fun ApiMessageAttachment.enrichedBy(incoming: ApiMessageAttachment): ApiMessageAttachment = copy(
        fileUrl = incoming.fileUrl?.takeIf { it.isNotBlank() } ?: fileUrl,
        thumbnailUrl = incoming.thumbnailUrl?.takeIf { it.isNotBlank() } ?: thumbnailUrl,
        thumbHash = incoming.thumbHash?.takeIf { it.isNotBlank() } ?: thumbHash,
        imageVariants = incoming.imageVariants?.takeIf { it.isNotEmpty() } ?: imageVariants,
        width = incoming.width ?: width,
        height = incoming.height ?: height,
        duration = incoming.duration ?: duration,
        bitrate = incoming.bitrate ?: bitrate,
        sampleRate = incoming.sampleRate ?: sampleRate,
        codec = incoming.codec ?: codec,
        channels = incoming.channels ?: channels,
        fps = incoming.fps ?: fps,
        videoCodec = incoming.videoCodec ?: videoCodec,
        pageCount = incoming.pageCount ?: pageCount,
        lineCount = incoming.lineCount ?: lineCount,
        alt = incoming.alt ?: alt,
        transcription = incoming.transcription ?: transcription,
        translations = joined(translations, incoming.translations),
        deliveredToAllAt = deliveredToAllAt ?: incoming.deliveredToAllAt,
        viewedByAllAt = viewedByAllAt ?: incoming.viewedByAllAt,
        downloadedByAllAt = downloadedByAllAt ?: incoming.downloadedByAllAt,
        listenedByAllAt = listenedByAllAt ?: incoming.listenedByAllAt,
        watchedByAllAt = watchedByAllAt ?: incoming.watchedByAllAt,
        viewedCount = forward(viewedCount, incoming.viewedCount),
        downloadedCount = forward(downloadedCount, incoming.downloadedCount),
        consumedCount = forward(consumedCount, incoming.consumedCount),
    )

    /**
     * Les pistes se joignent par langue. À langue égale, l'entrée reçue gagne seulement si elle est AU MOINS aussi
     * récente que celle qu'on tient (horodatage servi des deux côtés) : une diffusion rejouée tard ne ressuscite
     * pas une piste ancienne. Sans horodatage comparable, la piste jouable déjà tenue reste ; une piste tenue
     * sans adresse est complétée par la reçue.
     */
    private fun joined(
        current: Map<String, ApiAttachmentTranslation>?,
        carried: Map<String, ApiAttachmentTranslation>?,
    ): Map<String, ApiAttachmentTranslation>? {
        if (carried.isNullOrEmpty()) return current
        if (current.isNullOrEmpty()) return carried
        return carried.entries.fold(current) { joined, (language, incoming) ->
            val held = joined[language]
            if (held == null || incoming.supersedes(held)) joined + (language to incoming) else joined
        }
    }

    private fun ApiAttachmentTranslation.supersedes(held: ApiAttachmentTranslation): Boolean {
        if (!held.isPlayable) return true
        val heldAt = held.servedAtMillis ?: return false
        val incomingAt = servedAtMillis ?: return false
        return incomingAt >= heldAt
    }

    private val ApiAttachmentTranslation.isPlayable: Boolean
        get() = !url.isNullOrBlank()

    private val ApiAttachmentTranslation.servedAtMillis: Long?
        get() = isoToEpochMillisOrNull(updatedAt) ?: isoToEpochMillisOrNull(createdAt)

    private fun forward(current: Int?, carried: Int?): Int? = when {
        carried == null -> current
        current == null -> carried
        else -> maxOf(current, carried)
    }

    private val ApiMessage.holdsCiphertext: Boolean
        get() = isEndToEndSealed || isEncrypted == true || EndToEndRegime.isEndToEnd(encryptionMode)

    private val ApiMessageAttachment.holdsCiphertext: Boolean
        get() = isEncrypted == true || EndToEndRegime.isEndToEnd(encryptionMode)
}
