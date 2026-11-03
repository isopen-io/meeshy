package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContentRemovalClient
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.api.MessageChatRestApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.MessageHidingPayload
import me.meeshy.sdk.outbox.ModerationDeletePayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.RemoveAttachmentPayload
import me.meeshy.sdk.outbox.SendFailureClassifier
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import javax.inject.Inject

/**
 * Une suppression est IDEMPOTENTE : ce que le serveur dit ne plus connaître (404 de la passerelle) ou avoir déjà appliqué
 * (410) est ce que la ligne voulait obtenir. Le 404 SYNTHÉTIQUE (`HTTP_404`, un proxy qui redémarre) n'est pas de la
 * passerelle : il reste classé par [SendFailureClassifier] — un succès à tort perdrait le geste.
 */
internal fun NetworkResult<*>.toIdempotentSendResult(): SendResult = when (this) {
    is NetworkResult.Success -> SendResult.Success
    is NetworkResult.Failure ->
        if (error.httpStatus == STATUS_GONE || (error.httpStatus == STATUS_NOT_FOUND && error.code != SYNTHETIC_NOT_FOUND)) {
            SendResult.Success
        } else {
            SendFailureClassifier.classify(error)
        }
}

/** Un accusé de suppression sans `data` est un succès, pas une réponse vide : [apiCall] l'y lirait comme un échec. */
private suspend fun acknowledged(block: suspend () -> ApiResponse<JsonElement>): NetworkResult<JsonElement> =
    apiCall {
        val response = block()
        if (response.success && response.data == null) response.copy(data = JsonNull) else response
    }

private const val STATUS_NOT_FOUND = 404
private const val STATUS_GONE = 410
private const val SYNTHETIC_NOT_FOUND = "HTTP_404"

private suspend fun refreshOf(repository: MessageRepository, row: OutboxEntity, conversationOf: (String) -> String?) {
    conversationOf(row.payload)?.let { repository.refresh(it) }
}

private fun conversationOfHiding(json: Json): (String) -> String? = { raw ->
    runCatching { json.decodeFromString<MessageHidingPayload>(raw) }.getOrNull()?.conversationId
}

/**
 * `HIDE_FOR_ME` : « supprimer pour moi ». L'effet local (la bulle devient une pierre tombale) est déjà posé ; un refus
 * définitif la relève et relit la fenêtre, pour que l'écran dise ce que le serveur sait.
 */
public class HideForMeHandler @Inject constructor(
    private val messageApi: MessageChatRestApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        acknowledged { messageApi.hideForMe(row.targetId) }.toIdempotentSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        messageRepository.markUndeleted(row.targetId)
        refreshOf(messageRepository, row, conversationOfHiding(json))
    }
}

/** `RESTORE_FOR_ME` : le message masqué revient chez moi ; un refus relit la fenêtre (la vérité du serveur gagne). */
public class RestoreForMeHandler @Inject constructor(
    private val messageApi: MessageChatRestApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val result = acknowledged { messageApi.restoreForMe(row.targetId) }.toSendResult()
        if (result == SendResult.Success) refreshOf(messageRepository, row, conversationOfHiding(json))
        return result
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        refreshOf(messageRepository, row, conversationOfHiding(json))
    }
}

/** `REMOVE_ATTACHMENT` : efface UNE pièce ; un refus relit le message pour que la pièce revienne à sa place. */
public class RemoveAttachmentHandler @Inject constructor(
    private val mediaApi: MediaApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        acknowledged { mediaApi.delete(row.targetId) }.toIdempotentSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        refreshOf(messageRepository, row) { raw ->
            runCatching { json.decodeFromString<RemoveAttachmentPayload>(raw) }.getOrNull()?.conversationId
        }
    }
}

/**
 * `MODERATION_DELETE` : le retrait d'un message par la modération, avec son motif. Un refus définitif relève la pierre
 * tombale posée localement et relit la fenêtre.
 */
public class ModerationDeleteHandler @Inject constructor(
    private val removals: ContentRemovalClient,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ModerationDeletePayload>(row) { payload ->
            removals.removeMessage(row.targetId, ContentRemovalRequest(payload.reason)).toIdempotentSendResult()
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        messageRepository.markUndeleted(row.targetId)
        refreshOf(messageRepository, row) { raw ->
            runCatching { json.decodeFromString<ModerationDeletePayload>(raw) }.getOrNull()?.conversationId
        }
    }
}

/**
 * `MARK_RECEIVED` : l'accusé de réception de toute la conversation (la double coche de l'expéditeur). Il partage son quota
 * avec `mark-as-read` côté passerelle ; rien à défaire s'il est refusé.
 */
public class MarkReceivedHandler @Inject constructor(
    private val conversationApi: ConversationApi,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { conversationApi.markReceived(row.targetId) }.toSendResult(row.targetId)
}

@Module
@InstallIn(SingletonComponent::class)
public interface ChatMessageActionSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.HIDE_FOR_ME)
    public fun hideForMe(handler: HideForMeHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.RESTORE_FOR_ME)
    public fun restoreForMe(handler: RestoreForMeHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.REMOVE_ATTACHMENT)
    public fun removeAttachment(handler: RemoveAttachmentHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.MODERATION_DELETE)
    public fun moderationDelete(handler: ModerationDeleteHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.MARK_RECEIVED)
    public fun markReceived(handler: MarkReceivedHandler): OutboxKindHandler
}
