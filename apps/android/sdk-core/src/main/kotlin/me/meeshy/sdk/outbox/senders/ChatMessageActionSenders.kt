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

/**
 * #18953 — un geste ne change qu'UN message : son retour arrière (ou la confirmation d'une restauration) relit ce message
 * par son id, comme les gestes de #18915, jamais la fenêtre de la conversation et ses pages au-delà — une lecture qui
 * tombait sur le réseau au moment même où l'utilisateur agissait. Une charge illisible ne relit rien.
 */
private suspend fun MessageRepository.refreshNamed(conversationId: String?, messageId: String) {
    conversationId?.let { refreshMessage(it, messageId) }
}

private fun Json.hidingConversation(raw: String): String? =
    runCatching { decodeFromString<MessageHidingPayload>(raw) }.getOrNull()?.conversationId

/**
 * `HIDE_FOR_ME` : « supprimer pour moi ». L'effet local (la bulle devient une pierre tombale) est déjà posé ; un refus
 * définitif la relève et relit CE message, pour que l'écran dise ce que le serveur sait.
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
        messageRepository.refreshNamed(json.hidingConversation(row.payload), row.targetId)
    }
}

/**
 * `RESTORE_FOR_ME` : le message masqué revient chez moi — accepté, il se relit par son id (#18953) ; un refus définitif
 * relit CE message aussi (#18915) — la vérité du serveur gagne, où qu'il soit dans le fil : relire la conversation n'en
 * lit que la fenêtre récente.
 */
public class RestoreForMeHandler @Inject constructor(
    private val messageApi: MessageChatRestApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val result = acknowledged { messageApi.restoreForMe(row.targetId) }.toSendResult()
        if (result == SendResult.Success) messageRepository.refreshNamed(json.hidingConversation(row.payload), row.targetId)
        return result
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        messageRepository.refreshNamed(json.hidingConversation(row.payload), row.targetId)
    }
}

/** `REMOVE_ATTACHMENT` : efface UNE pièce ; un refus relit son message, par son id, pour que la pièce revienne à sa place. */
public class RemoveAttachmentHandler @Inject constructor(
    private val mediaApi: MediaApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        acknowledged { mediaApi.delete(row.targetId) }.toIdempotentSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        runCatching { json.decodeFromString<RemoveAttachmentPayload>(row.payload) }.getOrNull()
            ?.let { messageRepository.refreshMessage(it.conversationId, it.messageId) }
    }
}

/**
 * `MODERATION_DELETE` : le retrait d'un message par la modération, avec son motif. Un refus définitif relève la pierre
 * tombale posée localement et relit CE message.
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
        val conversationId = runCatching { json.decodeFromString<ModerationDeletePayload>(row.payload) }.getOrNull()?.conversationId
        messageRepository.refreshNamed(conversationId, row.targetId)
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
