package me.meeshy.app.chat

import java.time.Instant
import me.meeshy.sdk.model.AudioQueueAttachment
import me.meeshy.sdk.model.AudioQueueBuilder
import me.meeshy.sdk.model.AudioQueueMessage
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.playback.MediaConsumptionSeed
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent

/** Le vocal touché et ce qui le suit : la file que le coordinateur partagé joue (iOS `audioQueueTailProvider`). */
internal data class ChatVoiceStart(val current: QueuedAudio, val tail: List<QueuedAudio>)

/**
 * **La file des vocaux du fil**, projetée des bulles vers [AudioQueueBuilder] (le port d'iOS) : le vocal touché joue,
 * puis les vocaux NON ÉCOUTÉS reçus après lui, dans l'ordre d'arrivée — les miens exclus, sauf les pièces suivantes du
 * message touché. La piste mise en file est la piste SERVIE ([BubbleAudio.url], élue par la langue du texte servi), et
 * un vocal est protégé si son message OU sa pièce l'est.
 */
internal object ChatVoiceQueue {

    /** L'auteur « moi » : la bulle sortante ne connaît pas toujours l'identifiant de son compte. */
    internal const val SELF = "\u0000self"

    fun start(
        tapped: BubbleAudio,
        bubble: BubbleContent,
        messages: List<BubbleContent>,
        conversationId: String,
        listenedAttachmentIds: Set<String>,
    ): ChatVoiceStart? {
        val url = tapped.url?.takeIf { it.isNotBlank() } ?: return null
        val thread = if (messages.any { it.messageId == bubble.messageId }) messages else messages + bubble
        val tail = AudioQueueBuilder.build(
            messages = queueMessages(thread, conversationId),
            startingAfterAttachmentId = tapped.attachmentId,
            currentUserId = SELF,
            listenedAttachmentIds = listenedAttachmentIds,
        )
        return ChatVoiceStart(current = bubble.queued(tapped, url, conversationId), tail = tail)
    }

    /** La variante (piste et langue) que la bulle sert maintenant pour [audio] : ce que le moteur doit jouer si le drapeau a basculé. */
    fun variant(audio: BubbleAudio, bubble: BubbleContent, conversationId: String): QueuedAudio? {
        val url = audio.url?.takeIf { it.isNotBlank() } ?: return null
        return bubble.queued(audio, url, conversationId)
    }

    /** La piste en lecture n'est pas celle que la bulle sert : un drapeau a basculé pendant l'écoute. */
    fun isStale(playing: QueuedAudio, served: QueuedAudio): Boolean =
        playing.attachmentId == served.attachmentId && playing.fileUrl != served.fileUrl &&
            (playing.isTranslatedTrack != served.isTranslatedTrack || !playing.trackLanguage.equals(served.trackLanguage, ignoreCase = true))

    /** Un vocal du hub média, joué seul : aucune file ne le suit. */
    fun lone(audio: BubbleAudio, messageId: String, senderName: String, sentAtEpochMs: Long, conversationId: String): QueuedAudio? {
        val url = audio.url?.takeIf { it.isNotBlank() } ?: return null
        return QueuedAudio(
            attachmentId = audio.attachmentId,
            messageId = messageId,
            conversationId = conversationId,
            fileUrl = url,
            durationMs = audio.declaredDurationMs,
            senderName = senderName,
            senderAvatarUrl = null,
            receivedAtEpochMs = sentAtEpochMs,
            trackLanguage = audio.playedLanguage,
            isTranslatedTrack = audio.isAudioTranslated,
            isProtected = audio.isProtected,
            servedConsumption = MediaConsumptionSeed.of(audio.lastPlayPositionMs, audio.listenedComplete),
        )
    }

    /** Le message est protégé (vue unique, flou, chiffré, éphémère) : chacun de ses vocaux l'est. */
    fun isMessageProtected(bubble: BubbleContent): Boolean =
        bubble.isViewOnce || bubble.isBlurred || bubble.isEndToEndSealed || bubble.expiresAtIso != null

    /** Un vocal de [bubble] ne s'écrit pas sur le disque et ne montre rien de lui-même : message OU pièce. */
    fun isProtected(bubble: BubbleContent, audio: BubbleAudio): Boolean = isMessageProtected(bubble) || audio.isProtected

    /** Les bulles à vocaux du fil, projetées pour [AudioQueueBuilder] et [me.meeshy.sdk.model.AudioQueueAppendTracker]. */
    fun queueMessages(thread: List<BubbleContent>, conversationId: String): List<AudioQueueMessage> =
        thread.filter { it.audios.isNotEmpty() && !it.isDeleted }.map { it.toQueueMessage(conversationId) }

    private fun BubbleContent.toQueueMessage(conversationId: String): AudioQueueMessage = AudioQueueMessage(
        messageId = messageId,
        conversationId = conversationId,
        senderId = if (isOutgoing) SELF else senderId ?: "peer:$messageId",
        senderName = senderName.orEmpty(),
        senderAvatarUrl = senderAvatarUrl,
        createdAtEpochMs = epochMs(createdAtIso),
        isProtected = isMessageProtected(this),
        audios = audios.filter { !it.url.isNullOrBlank() }.map { audio ->
            AudioQueueAttachment(
                attachmentId = audio.attachmentId,
                fileUrl = audio.url.orEmpty(),
                durationMs = audio.declaredDurationMs,
                isProtected = audio.isProtected,
                listenedComplete = audio.listenedComplete,
                trackLanguage = audio.playedLanguage,
                isTranslatedTrack = audio.isAudioTranslated,
                lastPlayPositionMs = audio.lastPlayPositionMs,
            )
        },
        attachmentIds = audios.map { it.attachmentId },
    )

    private fun BubbleContent.queued(audio: BubbleAudio, url: String, conversationId: String): QueuedAudio = QueuedAudio(
        attachmentId = audio.attachmentId,
        messageId = messageId,
        conversationId = conversationId,
        fileUrl = url,
        durationMs = audio.declaredDurationMs,
        senderName = senderName.orEmpty(),
        senderAvatarUrl = senderAvatarUrl,
        receivedAtEpochMs = epochMs(createdAtIso),
        trackLanguage = audio.playedLanguage,
        isTranslatedTrack = audio.isAudioTranslated,
        isProtected = isProtected(this, audio),
        servedConsumption = MediaConsumptionSeed.of(audio.lastPlayPositionMs, audio.listenedComplete),
    )

    private fun epochMs(iso: String?): Long = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L
}
