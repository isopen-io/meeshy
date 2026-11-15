package me.meeshy.app.chat.audio

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import me.meeshy.app.chat.ChatVoiceQueue
import me.meeshy.app.chat.ChatVoiceThread
import me.meeshy.sdk.model.AudioQueueAppendTracker
import me.meeshy.sdk.playback.ConversationAudioCoordinator

/**
 * **Les vocaux reçus pendant l'écoute rejoignent la file** (iOS `ConversationAudioQueueFeed`) : chaque émission du fil
 * est confrontée à la mémoire d'[AudioQueueAppendTracker] ; ce qui arrive d'un autre auteur dans la conversation JOUÉE,
 * non écouté, est remis au coordinateur partagé, qui l'ajoute à la fin de la file. Jamais l'arriéré : sans lecture dans
 * ce fil, l'émission ne fait que rebaser la mémoire.
 *
 * Une émission qui ne change pas la suite des messages (édition, réaction, progression) est ignorée avant tout calcul :
 * seuls les messages nouveaux peuvent être des arrivées.
 */
internal class ConversationAudioQueueFeed(
    private val coordinator: ConversationAudioCoordinator,
    private val listenedAttachmentIds: () -> Set<String>,
) {
    private var tracker = AudioQueueAppendTracker()

    suspend fun follow(threads: Flow<ChatVoiceThread?>) {
        threads
            .filterNotNull()
            .distinctUntilChanged { before, after -> before.sameMessages(after) }
            .collect(::onThread)
    }

    private fun onThread(thread: ChatVoiceThread) {
        val (arrivals, next) = tracker.next(
            snapshot = ChatVoiceQueue.queueMessages(thread.messages, thread.conversationId),
            activeConversationId = coordinator.snapshot.value.context?.audio?.conversationId,
            conversationId = thread.conversationId,
            currentUserId = ChatVoiceQueue.SELF,
            listenedAttachmentIds = listenedAttachmentIds(),
        )
        tracker = next
        arrivals.forEach(coordinator::appendUpcoming)
    }

    private fun ChatVoiceThread.sameMessages(other: ChatVoiceThread): Boolean =
        conversationId == other.conversationId &&
            messages.size == other.messages.size &&
            messages.indices.all { messages[it].messageId == other.messages[it].messageId }
}
