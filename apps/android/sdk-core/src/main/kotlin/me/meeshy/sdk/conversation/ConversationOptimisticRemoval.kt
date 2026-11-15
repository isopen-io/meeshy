package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxEnqueueResult
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.senders.ConversationRemovalPayload

/** Les trois retraits d'une conversation (iOS `UserStateMutation.leave` / `.deleteForUser`, et la fin pour tous). */
enum class ConversationRemoval(val outboxKind: OutboxKind) {
    LEAVE(OutboxKind.LEAVE_CONVERSATION),
    DELETE_FOR_ME(OutboxKind.DELETE_CONVERSATION_FOR_ME),
    DELETE_FOR_ALL(OutboxKind.DELETE_CONVERSATION_FOR_ALL),
}

/** Ce qu'un geste de retrait a fait. */
sealed interface ConversationRemovalWrite {
    /** La rangée a quitté la liste à l'instant ; la requête est en file et part au retour du réseau. */
    data object Queued : ConversationRemovalWrite

    /** Rien n'a été retiré (file pleine, compte fermé) : la rangée reste. */
    data class Failed(val message: String?) : ConversationRemovalWrite
}

/** La passerelle a refusé un retrait pour de bon : la rangée est rendue à la liste, l'écran prévient l'utilisateur. */
data class ConversationRemovalRefusal(val conversationId: String, val removal: ConversationRemoval)

/** Le canal des retraits refusés, émis par les envoyeurs de la file ([me.meeshy.sdk.outbox.senders.ConversationRemovalHandler]). */
@Singleton
class ConversationRemovalEvents @Inject constructor() {
    private val flow = MutableSharedFlow<ConversationRemovalRefusal>(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    val refusals: SharedFlow<ConversationRemovalRefusal> = flow.asSharedFlow()

    fun emit(conversationId: String, kind: OutboxKind) {
        val removal = ConversationRemoval.entries.firstOrNull { it.outboxKind == kind } ?: return
        flow.tryEmit(ConversationRemovalRefusal(conversationId, removal))
    }
}

/** Le retrait optimiste d'une conversation, tel que la liste le voit (couture : les tests l'incarnent sans Room). */
interface ConversationRemoving {
    suspend fun remove(conversationId: String, removal: ConversationRemoval): ConversationRemovalWrite

    /** Les retraits que la passerelle a refusés pour de bon. */
    val refusals: Flow<ConversationRemovalRefusal> get() = emptyFlow()

    object Unavailable : ConversationRemoving {
        override suspend fun remove(conversationId: String, removal: ConversationRemoval): ConversationRemovalWrite =
            ConversationRemovalWrite.Failed(null)
    }
}

/**
 * Quitter, supprimer pour soi, terminer pour tous : la rangée quitte la liste à l'instant — même hors ligne —, la requête
 * rejoint la file (une ligne PAR geste, jamais fusionnée) et part au retour du réseau. Miroir de `ConversationStore.apply`
 * d'iOS pour `.leave` / `.deleteForUser`. Un refus définitif rend la rangée ([me.meeshy.sdk.outbox.senders.ConversationRemovalHandler]).
 *
 * Aucun retrait local n'est fait tant que la file n'a pas accepté la ligne : une file pleine laisse la rangée en place.
 */
@Singleton
class ConversationOptimisticRemoval @Inject constructor(
    private val conversationDao: ConversationDao,
    private val repository: ConversationRepository,
    private val outbox: OutboxRepository,
    private val flushScheduler: OutboxFlushScheduler,
    private val events: ConversationRemovalEvents,
) : ConversationRemoving {

    override val refusals: Flow<ConversationRemovalRefusal> get() = events.refusals

    override suspend fun remove(conversationId: String, removal: ConversationRemoval): ConversationRemovalWrite {
        if (conversationId.isBlank()) return ConversationRemovalWrite.Failed(null)
        return try {
            val payload = ConversationRemovalPayload(snapshot = repository.cachedById(conversationId))
            val queued = outbox.tryEnqueue(
                OutboxMutation(
                    kind = removal.outboxKind,
                    lane = OutboxLanes.CONVERSATION_STATE,
                    targetId = conversationId,
                    payload = MeeshyApi.json.encodeToString(ConversationRemovalPayload.serializer(), payload),
                ),
            )
            if (queued !is OutboxEnqueueResult.Accepted) return ConversationRemovalWrite.Failed(null)
            conversationDao.deleteByIds(listOf(conversationId))
            flushScheduler.schedule()
            ConversationRemovalWrite.Queued
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            ConversationRemovalWrite.Failed(e.message)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface ConversationRemovalModule {
    @Binds
    fun conversationRemoving(impl: ConversationOptimisticRemoval): ConversationRemoving
}
