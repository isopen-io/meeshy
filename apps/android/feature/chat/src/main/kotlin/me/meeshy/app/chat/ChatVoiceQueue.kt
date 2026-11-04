package me.meeshy.app.chat

import java.time.Instant
import me.meeshy.sdk.model.AudioQueueAttachment
import me.meeshy.sdk.model.AudioQueueBuilder
import me.meeshy.sdk.model.AudioQueueMessage
import me.meeshy.sdk.model.QueuedAudio
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
    private const val SELF = "\u0000self"

    fun start(
        tapped: BubbleAudio,
        bubble: BubbleContent,
        messages: List<BubbleContent>,
        conversationId: String,
        listenedAttachmentIds: Set<String>,
    ): ChatVoiceStart? {
        val url = tapped.url?.takeIf { it.isNotBlank() } ?: return null
        val thread = if (messages.any { it.messageId == bubble.messageId }) messages else messages + bubble
        val queueMessages = thread.filter { it.audios.isNotEmpty() && !it.isDeleted }.map { it.toQueueMessage(conversationId) }
        val served = thread.flatMap { it.audios }.filter { it.listenedComplete }.mapTo(HashSet()) { it.attachmentId }
        val tail = AudioQueueBuilder.build(
            messages = queueMessages,
            startingAfterAttachmentId = tapped.attachmentId,
            currentUserId = SELF,
            listenedAttachmentIds = listenedAttachmentIds + served,
        ).map { queued -> queued.withServedTrack(thread) }
        return ChatVoiceStart(current = bubble.queued(tapped, url, conversationId), tail = tail)
    }

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
            trackLanguage = audio.audioLanguage,
            isTranslatedTrack = audio.isAudioTranslated,
            isProtected = audio.isProtected,
        )
    }

    /** Le message est protégé (vue unique, flou, chiffré, éphémère) : chacun de ses vocaux l'est. */
    fun isMessageProtected(bubble: BubbleContent): Boolean =
        bubble.isViewOnce || bubble.isBlurred || bubble.isEndToEndSealed || bubble.expiresAtIso != null

    /** Un vocal de [bubble] ne s'écrit pas sur le disque et ne montre rien de lui-même : message OU pièce. */
    fun isProtected(bubble: BubbleContent, audio: BubbleAudio): Boolean = isMessageProtected(bubble) || audio.isProtected

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
        trackLanguage = audio.audioLanguage,
        isTranslatedTrack = audio.isAudioTranslated,
        isProtected = isProtected(this, audio),
    )

    private fun QueuedAudio.withServedTrack(thread: List<BubbleContent>): QueuedAudio {
        val audio = thread.firstOrNull { it.messageId == messageId }?.audios?.firstOrNull { it.attachmentId == attachmentId } ?: return this
        return copy(trackLanguage = audio.audioLanguage, isTranslatedTrack = audio.isAudioTranslated)
    }

    private fun epochMs(iso: String?): Long = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L
}
