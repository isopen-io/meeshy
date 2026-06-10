package me.meeshy.sdk.sync

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.core.common.ApplicationScope
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException

@Singleton
class ConversationSyncEngine @Inject constructor(
    private val socketManager: SocketManager,
    private val messageSocketManager: MessageSocketManager,
    private val conversationRepository: ConversationRepository,
    private val messageRepository: MessageRepository,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private val subscribed = AtomicBoolean(false)

    fun start() {
        scope.launch {
            runCatching { conversationRepository.refresh() }
                .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: initial refresh failed") }
        }

        if (!subscribed.compareAndSet(false, true)) return

        socketManager.connected
            .onEach { onReconnect() }
            .launchIn(scope)

        messageSocketManager.messageReceived
            .onEach { event ->
                runCatching { messageRepository.upsertFromSocket(event) }
                    .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: upsertFromSocket (received) failed") }
            }
            .launchIn(scope)

        messageSocketManager.messageUpdated
            .onEach { event ->
                runCatching { messageRepository.upsertFromSocket(event) }
                    .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: upsertFromSocket (updated) failed") }
            }
            .launchIn(scope)

        messageSocketManager.messageDeleted
            .onEach { event ->
                runCatching { messageRepository.markDeleted(event.messageId, event.deletedAt) }
                    .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: markDeleted failed") }
            }
            .launchIn(scope)

        messageSocketManager.reactionAdded
            .onEach { event ->
                runCatching { messageRepository.updateReactions(event.messageId, event.emoji, delta = +1) }
                    .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: updateReactions (added) failed") }
            }
            .launchIn(scope)

        messageSocketManager.reactionRemoved
            .onEach { event ->
                runCatching { messageRepository.updateReactions(event.messageId, event.emoji, delta = -1) }
                    .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: updateReactions (removed) failed") }
            }
            .launchIn(scope)

        messageSocketManager.unreadUpdated
            .onEach { event ->
                runCatching { conversationRepository.updateUnreadCount(event.conversationId, event.unreadCount) }
                    .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: updateUnreadCount failed") }
            }
            .launchIn(scope)

        messageSocketManager.conversationUpdated
            .onEach { event ->
                runCatching { conversationRepository.refreshOne(event.conversationId) }
                    .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: refreshOne failed") }
            }
            .launchIn(scope)
    }

    private suspend fun onReconnect() {
        runCatching { conversationRepository.refresh() }
            .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: reconnect conversation refresh failed") }

        val ids = runCatching { conversationRepository.cachedIds() }
            .getOrElse { t ->
                if (t is CancellationException) throw t else Timber.e(t, "ConversationSyncEngine: cachedIds failed")
                emptyList()
            }

        ids.chunked(3).forEach { chunk ->
            chunk.map { id ->
                scope.async {
                    runCatching { messageRepository.refresh(id) }
                        .onFailure { if (it is CancellationException) throw it else Timber.e(it, "ConversationSyncEngine: message refresh failed for $id") }
                }
            }.awaitAll()
        }
    }
}
