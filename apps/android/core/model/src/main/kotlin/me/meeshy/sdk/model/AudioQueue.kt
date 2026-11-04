package me.meeshy.sdk.model

/**
 * Un vocal de la file de lecture d'une conversation — port de `QueuedAudio` d'iOS.
 * [trackLanguage] est la langue de la piste [fileUrl] (élue par la langue du texte servi), `null`
 * quand l'appelant ne la connaît pas. [isProtected] : éphémère, vue unique, flouté ou chiffré — rien
 * de son contenu ne part vers l'écran verrouillé, aucun octet sur le disque. Sans défaut : la file la recopie
 * de [AudioQueueMessage] et [AudioQueueAttachment] ; une entrée qui l'oublie ne compile pas.
 */
public data class QueuedAudio(
    val attachmentId: String,
    val messageId: String,
    val conversationId: String,
    val fileUrl: String,
    val durationMs: Long,
    val senderName: String,
    val senderAvatarUrl: String?,
    val receivedAtEpochMs: Long,
    val trackLanguage: String? = null,
    val isTranslatedTrack: Boolean = false,
    val isProtected: Boolean,
    val servedConsumption: MeeshyMediaConsumption? = MeeshyMediaConsumption(),
)

/**
 * Ce que la file lit d'un message : l'ordre des pièces jointes est celui du message. [isProtected] est la
 * protection du MESSAGE ([VoiceQueueProtection.ofMessage]) ; requise, elle ne se tait jamais en `false`.
 */
public data class AudioQueueMessage(
    val messageId: String,
    val conversationId: String,
    val senderId: String?,
    val senderName: String,
    val senderAvatarUrl: String?,
    val createdAtEpochMs: Long,
    val isProtected: Boolean,
    val audios: List<AudioQueueAttachment>,
    /** Tous les identifiants de pièces jointes du message (audio ou non), pour situer le curseur. */
    val attachmentIds: List<String> = audios.map { it.attachmentId },
)

/**
 * Un vocal du message ; [isProtected] est celle de la PIÈCE ([VoiceQueueProtection.ofPiece]), requise.
 * [listenedComplete] : la consommation SERVIE dit qu'il a été écouté jusqu'au bout — il ne rejoint jamais la file.
 * [trackLanguage] et [isTranslatedTrack] décrivent la piste [fileUrl] (élue par le Prisme,
 * [me.meeshy.sdk.lang.AttachmentTranscriptPrism.playedTrack]) ; la file les recopie, sans seconde descente.
 */
public data class AudioQueueAttachment(
    val attachmentId: String,
    val fileUrl: String,
    val durationMs: Long,
    val isProtected: Boolean,
    val listenedComplete: Boolean = false,
    val trackLanguage: String? = null,
    val isTranslatedTrack: Boolean = false,
)

/** L'entrée de file d'une pièce de ce message : protection du message OU de la pièce (leçon 275), piste servie recopiée. */
internal fun AudioQueueMessage.queued(audio: AudioQueueAttachment, fileUrl: String = audio.fileUrl): QueuedAudio = QueuedAudio(
    attachmentId = audio.attachmentId,
    messageId = messageId,
    conversationId = conversationId,
    fileUrl = fileUrl,
    durationMs = audio.durationMs,
    senderName = senderName,
    senderAvatarUrl = senderAvatarUrl,
    receivedAtEpochMs = createdAtEpochMs,
    trackLanguage = audio.trackLanguage,
    isTranslatedTrack = audio.isTranslatedTrack,
    isProtected = isProtected || audio.isProtected,
)

/**
 * **La file des vocaux non écoutés d'une conversation** — port de `AudioQueueBuilder` d'iOS : fonction
 * pure, sans moteur ni interface.
 *
 * 1. Les vocaux de l'utilisateur sont exclus — SAUF le message du curseur : on peut jouer son propre
 *    message à plusieurs pièces, et l'auto-avance doit enchaîner les pièces suivantes.
 * 2. Les vocaux déjà écoutés (session ou consommation servie [AudioQueueAttachment.listenedComplete]) sont exclus.
 * 3. Avec un curseur, ne restent que les vocaux strictement APRÈS lui (date, puis rang dans le message).
 * 4. Tri par date croissante puis identifiant ; à l'intérieur d'un message, l'ordre des pièces gagne.
 * 5. Un vocal est protégé si son message OU sa pièce l'est (leçon 275) ; le résolveur de piste ne change que l'URL.
 */
public object AudioQueueBuilder {

    public fun build(
        messages: List<AudioQueueMessage>,
        startingAfterAttachmentId: String?,
        currentUserId: String,
        listenedAttachmentIds: Set<String>,
        trackUrlResolver: ((AudioQueueMessage, AudioQueueAttachment) -> String)? = null,
    ): List<QueuedAudio> {
        val cursorMessage = startingAfterAttachmentId?.let { id -> messages.firstOrNull { id in it.attachmentIds } }

        val candidates = messages.flatMap { message ->
            val isCursorMessage = message.messageId == cursorMessage?.messageId
            if (message.senderId == currentUserId && !isCursorMessage) return@flatMap emptyList()
            message.audios
                .filter { it.attachmentId !in listenedAttachmentIds && !it.listenedComplete }
                .map { audio -> message.queued(audio, trackUrlResolver?.invoke(message, audio) ?: audio.fileUrl) }
        }

        val afterCursor = if (cursorMessage != null && startingAfterAttachmentId != null) {
            candidates.filter { isAfterCursor(it, cursorMessage, startingAfterAttachmentId) }
        } else {
            candidates
        }

        val sorted = afterCursor.sortedWith(
            compareBy<QueuedAudio> { it.receivedAtEpochMs }.thenBy { it.attachmentId },
        )
        return reorderWithinMessages(sorted, messages)
    }

    private fun isAfterCursor(audio: QueuedAudio, cursorMessage: AudioQueueMessage, cursorId: String): Boolean = when {
        audio.receivedAtEpochMs > cursorMessage.createdAtEpochMs -> true
        audio.receivedAtEpochMs < cursorMessage.createdAtEpochMs -> false
        audio.attachmentId == cursorId -> false
        audio.messageId == cursorMessage.messageId -> {
            val cursorIndex = cursorMessage.attachmentIds.indexOf(cursorId)
            val targetIndex = cursorMessage.attachmentIds.indexOf(audio.attachmentId)
            if (cursorIndex < 0 || targetIndex < 0) true else targetIndex > cursorIndex
        }
        else -> false
    }

    private fun reorderWithinMessages(queue: List<QueuedAudio>, messages: List<AudioQueueMessage>): List<QueuedAudio> {
        val grouped = queue.groupBy { it.messageId }
        val byId = messages.associateBy { it.messageId }
        return queue.map { it.messageId }.distinct().flatMap { messageId ->
            val group = grouped.getValue(messageId)
            val order = byId[messageId]?.attachmentIds ?: return@flatMap group
            group.sortedBy { order.indexOf(it.attachmentId).let { index -> if (index < 0) Int.MAX_VALUE else index } }
        }
    }
}

/**
 * **La file vivante du lecteur partagé** : le vocal courant, ce qui vient après, ce qui a été joué
 * (pour « précédent »). Immuable ; le coordinateur en garde la dernière valeur.
 */
public data class AudioPlayQueue(
    val current: QueuedAudio? = null,
    val upcoming: List<QueuedAudio> = emptyList(),
    val played: List<QueuedAudio> = emptyList(),
) {
    /** Joue [current] maintenant, suivi de [tail] ; l'historique de la file précédente tombe. */
    public fun started(current: QueuedAudio, tail: List<QueuedAudio>): AudioPlayQueue =
        AudioPlayQueue(current = current, upcoming = tail.distinctBy { it.attachmentId }.filter { it.attachmentId != current.attachmentId })

    /** Un vocal arrivé pendant la lecture rejoint la fin ; un doublon (déjà courant ou en attente) est ignoré. */
    public fun appended(item: QueuedAudio): AudioPlayQueue {
        val known = current?.attachmentId == item.attachmentId || upcoming.any { it.attachmentId == item.attachmentId }
        return if (current == null || known) this else copy(upcoming = upcoming + item)
    }

    /** Le suivant devient courant ; le courant rejoint l'historique. Sans suivant : la file est vide. */
    public fun advanced(): AudioPlayQueue {
        val next = upcoming.firstOrNull() ?: return AudioPlayQueue()
        return AudioPlayQueue(
            current = next,
            upcoming = upcoming.drop(1),
            played = current?.let { played + it } ?: played,
        )
    }

    /** Le précédent redevient courant ; le courant repasse en tête de ce qui vient. Sans historique : inchangée. */
    public fun rewound(): AudioPlayQueue {
        val previous = played.lastOrNull() ?: return this
        return AudioPlayQueue(
            current = previous,
            upcoming = listOfNotNull(current) + upcoming,
            played = played.dropLast(1),
        )
    }

    /** Le message est supprimé : ses vocaux quittent la file ; s'il était courant, le courant est nul. */
    public fun withoutMessage(messageId: String): AudioPlayQueue = copy(
        current = current?.takeUnless { it.messageId == messageId },
        upcoming = upcoming.filterNot { it.messageId == messageId },
        played = played.filterNot { it.messageId == messageId },
    )

    /**
     * #15969 — le vocal courant [fromAttachmentId] a été accusé : il prend son id serveur et l'adresse servie ; la suite et
     * l'historique ne bougent pas ; [messageId], quand il est connu, est l'id serveur de son message. Une autre pièce, ou
     * une file vide, laisse la file telle quelle.
     */
    public fun followed(fromAttachmentId: String, toAttachmentId: String, fileUrl: String, messageId: String? = null): AudioPlayQueue {
        val playing = current?.takeIf { it.attachmentId == fromAttachmentId } ?: return this
        return copy(current = playing.copy(attachmentId = toAttachmentId, fileUrl = fileUrl, messageId = messageId ?: playing.messageId))
    }

    public fun withUpcoming(tail: List<QueuedAudio>): AudioPlayQueue = this

    public val hasNext: Boolean get() = upcoming.isNotEmpty()
    public val hasPrevious: Boolean get() = played.isNotEmpty()
}

/** Les vitesses du lecteur partagé (mini-lecteur, notification) : ×1, ×1,5, ×2, puis on reboucle. */
public object CoordinatorSpeedCycle {
    public val steps: List<me.meeshy.sdk.model.media.PlaybackSpeed> = listOf(
        me.meeshy.sdk.model.media.PlaybackSpeed.X1_0,
        me.meeshy.sdk.model.media.PlaybackSpeed.X1_5,
        me.meeshy.sdk.model.media.PlaybackSpeed.X2_0,
    )

    /** Hors de la grille du coordinateur (ex. ×0,8 choisi dans la bulle), le cycle repart de ×1. */
    public fun next(current: me.meeshy.sdk.model.media.PlaybackSpeed): me.meeshy.sdk.model.media.PlaybackSpeed {
        val index = steps.indexOf(current)
        return if (index < 0) steps.first() else steps[(index + 1) % steps.size]
    }
}
