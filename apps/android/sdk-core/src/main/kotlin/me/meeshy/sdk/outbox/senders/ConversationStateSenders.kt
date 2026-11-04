package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.ConversationRemovalEvents
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import javax.inject.Inject

/**
 * La charge d'une ligne de retrait de conversation (`LEAVE_CONVERSATION`, `DELETE_CONVERSATION_FOR_ME`,
 * `DELETE_CONVERSATION_FOR_ALL`) : la cible de la ligne est la conversation, [snapshot] est la ligne telle qu'elle
 * était AVANT le retrait optimiste, pour la rendre si la passerelle refuse. Absent d'une ligne écrite sans cache (rien à rendre).
 */
@Serializable
public data class ConversationRemovalPayload(val snapshot: ApiConversation? = null)

/**
 * Le rejeu d'un retrait de conversation. Chaque appel porte sa propre ligne (clé de file unique, jamais fusionnée) :
 *
 * - succès, ou « déjà fait » (410, ou 404 de la passerelle : la conversation n'existe plus) : la ligne part de la file ;
 * - refus définitif (400 / 403 / 422…) : la ligne s'épuise, [onExhausted] rend la rangée et prévient l'écran ;
 * - réseau coupé, 5xx, 429 : la ligne reste, reprise à la cadence des retraits ([me.meeshy.sdk.outbox.OutboxBackoff]).
 */
public abstract class ConversationRemovalHandler(
    private val repository: ConversationRepository,
    private val json: Json,
    private val events: ConversationRemovalEvents,
    private val kind: OutboxKind,
) : OutboxKindHandler {

    protected abstract suspend fun call(conversationId: String): NetworkResult<Unit>

    override suspend fun send(row: OutboxEntity): SendResult = when (val result = call(row.targetId)) {
        is NetworkResult.Success -> SendResult.Success
        is NetworkResult.Failure -> if (alreadyApplied(result.error)) SendResult.Success else result.toSendResult()
    }

    /** Le refus est définitif (ou les essais sont épuisés) : la rangée retrouve sa place et l'écran le dit. */
    override suspend fun onExhausted(row: OutboxEntity) {
        val snapshot = runCatching { json.decodeFromString<ConversationRemovalPayload>(row.payload).snapshot }.getOrNull()
        snapshot?.let { repository.remember(it) }
        events.emit(row.targetId, kind)
    }

    private fun alreadyApplied(error: ApiError): Boolean {
        val status = error.httpStatus ?: return false
        return status == HTTP_GONE || (status == HTTP_NOT_FOUND && error.code != null && error.code != "HTTP_$HTTP_NOT_FOUND")
    }

    private companion object {
        const val HTTP_GONE = 410
        const val HTTP_NOT_FOUND = 404
    }
}

/** `LEAVE_CONVERSATION` : quitte la conversation. */
public class LeaveConversationHandler @Inject constructor(
    private val conversations: ConversationRepository,
    json: Json,
    events: ConversationRemovalEvents,
) : ConversationRemovalHandler(conversations, json, events, OutboxKind.LEAVE_CONVERSATION) {
    override suspend fun call(conversationId: String): NetworkResult<Unit> = conversations.leave(conversationId)
}

/** `DELETE_CONVERSATION_FOR_ME` : retire la conversation pour soi seul. */
public class DeleteConversationForMeHandler @Inject constructor(
    private val conversations: ConversationRepository,
    json: Json,
    events: ConversationRemovalEvents,
) : ConversationRemovalHandler(conversations, json, events, OutboxKind.DELETE_CONVERSATION_FOR_ME) {
    override suspend fun call(conversationId: String): NetworkResult<Unit> = conversations.deleteForMe(conversationId)
}

/** `DELETE_CONVERSATION_FOR_ALL` : termine la conversation pour tous (le créateur seul, la passerelle le fait respecter). */
public class DeleteConversationForAllHandler @Inject constructor(
    private val conversations: ConversationRepository,
    json: Json,
    events: ConversationRemovalEvents,
) : ConversationRemovalHandler(conversations, json, events, OutboxKind.DELETE_CONVERSATION_FOR_ALL) {
    override suspend fun call(conversationId: String): NetworkResult<Unit> = conversations.deleteForAll(conversationId)
}

@Module
@InstallIn(SingletonComponent::class)
public interface ConversationStateSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.LEAVE_CONVERSATION)
    public fun leaveConversation(handler: LeaveConversationHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.DELETE_CONVERSATION_FOR_ME)
    public fun deleteConversationForMe(handler: DeleteConversationForMeHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.DELETE_CONVERSATION_FOR_ALL)
    public fun deleteConversationForAll(handler: DeleteConversationForAllHandler): OutboxKindHandler
}
