package me.meeshy.app.chat.audio

import java.time.Instant
import me.meeshy.app.chat.ChatVoiceQueue
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent

/** Ce que le toucher d'une citation de vocal joue : le vocal, son message et de quoi nommer la lecture. */
internal data class QuotedVoice(
    val audio: BubbleAudio,
    val messageId: String,
    val senderName: String,
    val sentAtEpochMs: Long,
)

/**
 * **Toucher la citation d'un vocal le joue, seul, sans file** (iOS `ConversationViewModel+QuotedAudio`).
 *
 * - Le message cité est dans la fenêtre du fil : on joue SA bulle — son vocal, donc la piste que le Prisme y a élue, et sa
 *   protection (message OU pièce) — jamais la copie de la citation.
 * - Il est hors de la fenêtre : on joue la pièce portée par la citation, qui n'existe que si le cité est ordinaire
 *   ([BubbleContent.replyToAudio]).
 * - Un cité supprimé, protégé (vue unique, flouté, chiffré, éphémère) ou sans adresse ne joue pas : `null`.
 */
internal object QuotedAudioPlayback {

    fun resolve(quoted: BubbleAudio, replyToId: String?, replyToSenderName: String?, thread: List<BubbleContent>): QuotedVoice? {
        val inWindow = replyToId?.let { id -> thread.firstOrNull { it.messageId == id } }
        if (inWindow == null) {
            val messageId = replyToId ?: return null
            if (quoted.isProtected || quoted.url.isNullOrBlank()) return null
            return QuotedVoice(quoted, messageId, replyToSenderName.orEmpty(), sentAtEpochMs = 0L)
        }
        if (inWindow.isDeleted) return null
        val own = inWindow.audios.firstOrNull { it.attachmentId == quoted.attachmentId } ?: return null
        if (own.url.isNullOrBlank() || ChatVoiceQueue.isProtected(inWindow, own)) return null
        return QuotedVoice(
            audio = own,
            messageId = inWindow.messageId,
            senderName = inWindow.senderName.orEmpty(),
            sentAtEpochMs = inWindow.createdAtIso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L,
        )
    }
}
