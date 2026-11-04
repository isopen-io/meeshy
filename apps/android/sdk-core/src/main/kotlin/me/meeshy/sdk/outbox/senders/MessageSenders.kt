package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.MessageMediaWriteBack
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.ShareFanoutWriteBack
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.model.SendOutcome
import me.meeshy.sdk.model.SendTransport
import me.meeshy.sdk.model.outbox.ReadListBounds
import me.meeshy.sdk.model.socket.SocketSendFallbackPolicy
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConsumeAfterReadRequest
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.notification.FirstMessageAcceptedSignal
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.OutboxPayloadGraft
import me.meeshy.sdk.outbox.OutboxPayloadGrafts
import me.meeshy.sdk.outbox.OutboxPlaintextAdmission
import me.meeshy.sdk.outbox.ConsumeAfterReadPayload
import me.meeshy.sdk.outbox.ConsumeViewOncePayload
import me.meeshy.sdk.outbox.PinPayload
import me.meeshy.sdk.outbox.SendAttemptRecorder
import me.meeshy.sdk.outbox.SendFailureClassifier
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.socket.MessageSocketOutcome
import me.meeshy.sdk.share.FanoutResolution
import me.meeshy.sdk.share.ShareFanoutOriginResolver
import me.meeshy.sdk.socket.MessageSocketSending
import javax.inject.Inject

/**
 * `SEND_MESSAGE`: posts the queued message, then reconciles the optimistic bubble with
 * the server copy. An exhausted send flips the bubble to its failed state. It owns the
 * graft that swaps an upload's placeholder `cmid` for the real attachment id.
 */
public class SendMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
    private val firstMessageAccepted: FirstMessageAcceptedSignal = FirstMessageAcceptedSignal(),
    private val attempts: SendAttemptRecorder = SendAttemptRecorder.None,
    private val socketFallback: MessageSocketSending = MessageSocketSending.None,
) : OutboxKindHandler {

    override val payloadGraft: OutboxPayloadGraft =
        OutboxPayloadGrafts.firstOf(MessageMediaWriteBack::graft, ShareFanoutWriteBack::graft)

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<SendMessageRequest>(row) { queued ->
            val request = when (val origin = fanoutOrigin(queued)) {
                is FanoutResolution.WaitingForOrigin -> return@withPayload SendResult.Deferred(
                    "Waiting for the share origin ${origin.clientMessageId} to be acknowledged",
                )
                is FanoutResolution.Ready -> queued.copy(copyAttachmentsFromMessageId = origin.serverMessageId)
                FanoutResolution.NotAFanout -> queued
            }
            val startedAt = System.currentTimeMillis()
            val result = apiCall { messageApi.send(row.targetId, request) }
            attempts.record(
                localId = row.cmid,
                transport = if (row.attempts > 0) SendTransport.OUTBOX else SendTransport.REST,
                startedAtMillis = startedAt,
                finishedAtMillis = System.currentTimeMillis(),
                outcome = if (result is NetworkResult.Success) SendOutcome.SUCCESS else SendOutcome.FAILURE,
                errorMessage = (result as? NetworkResult.Failure)?.error?.message,
            )
            when (result) {
                is NetworkResult.Success -> {
                    messageRepository.reconcileSent(row.cmid, result.data)
                    firstMessageAccepted.notifyAccepted()
                    SendResult.SuccessWithId(result.data.id)
                }
                is NetworkResult.Failure -> PlaintextRefusal.of(result, row.targetId, ledger)
                    ?: viaSocket(row, request, SendFailureClassifier.classify(result.error), result.error)
            }
        }

    /**
     * Une copie de pièces dont l'origine n'est plus un placeholder `cid_` greffé (ligne d'origine déjà acquittée et retirée
     * avant l'enfilage) se résout par le pont `cid -> id serveur` ; sans lui la ligne attend, jamais un identifiant fantôme.
     */
    private suspend fun fanoutOrigin(request: SendMessageRequest): FanoutResolution {
        val source = request.copyAttachmentsFromMessageId?.takeIf { it.isNotBlank() }
            ?: return FanoutResolution.NotAFanout
        if (!OutboxIds.isValidCid(source)) return FanoutResolution.Ready(source)
        return ShareFanoutOriginResolver.resolve(source, messageRepository.serverIdOf(source))
    }

    /**
     * Repli socket (iOS `sendViaSocketFallback`) : seulement pour un échec réseau / 5xx du REST, jamais un 4xx, avec le MÊME
     * `clientMessageId`. Un accusé réconcilie la bulle ; un refus définitif abandonne la ligne ; tout le reste rend le
     * résultat du REST (la ligne reste en file).
     */
    private suspend fun viaSocket(row: OutboxEntity, request: SendMessageRequest, rest: SendResult, error: ApiError): SendResult {
        if (rest is SendResult.PermanentFailure || !SocketSendFallbackPolicy.allowsFallback(error.httpStatus, error.code)) return rest
        val startedAt = System.currentTimeMillis()
        val outcome = socketFallback.send(row.targetId, request)
        if (outcome is MessageSocketOutcome.NotSent) return rest
        attempts.record(
            localId = row.cmid,
            transport = SendTransport.SOCKET_FALLBACK,
            startedAtMillis = startedAt,
            finishedAtMillis = System.currentTimeMillis(),
            outcome = if (outcome is MessageSocketOutcome.Acked) SendOutcome.SUCCESS else SendOutcome.FAILURE,
            errorMessage = (outcome as? MessageSocketOutcome.Refused)?.refusal?.message,
        )
        return when (outcome) {
            is MessageSocketOutcome.Acked -> {
                messageRepository.reconcileAcknowledged(row.cmid, outcome.ack)
                firstMessageAccepted.notifyAccepted()
                SendResult.SuccessWithId(outcome.ack.messageId)
            }
            is MessageSocketOutcome.Refused ->
                if (outcome.definitive) SendResult.PermanentFailure("Refused: ${outcome.refusal.code.orEmpty()}".trim()) else rest
            MessageSocketOutcome.NotSent, MessageSocketOutcome.Unanswered -> rest
        }
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        messageRepository.markSendFailed(row.cmid, row.lastError)
    }
}

/** `EDIT_MESSAGE`: patches the message content. */
public class EditMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val json: Json,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<EditMessageRequest>(row) { body ->
            val result = apiCall { messageApi.edit(row.targetId, body) }
            (result as? NetworkResult.Failure)?.let { PlaintextRefusal.of(it, PlaintextRefusal.laneConversation(row.lane), ledger) }
                ?: result.toSendResult()
        }
}

/**
 * #13628 — la passerelle a refusé un CLAIR vers une conversation chiffrée de bout en bout (`E2EE_PLAINTEXT_REFUSED`, #11216) :
 * l'appareil l'ignorait (événement d'activation manqué). Il l'apprend aussitôt — aucune ligne suivante ne part en clair — et la
 * ligne est épuisée au lieu d'être renvoyée en clair à chaque essai.
 */
internal object PlaintextRefusal {
    const val CODE: String = "E2EE_PLAINTEXT_REFUSED"

    private const val MESSAGE_LANE_PREFIX: String = "message:"

    fun of(failure: NetworkResult.Failure, conversationId: String?, ledger: EndToEndRegimeLedger): SendResult? {
        if (failure.error.code != CODE) return null
        conversationId?.takeIf { it.isNotBlank() }?.let(ledger::learn)
        return SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_END_TO_END)
    }

    fun laneConversation(lane: String): String? =
        lane.takeIf { it.startsWith(MESSAGE_LANE_PREFIX) }?.removePrefix(MESSAGE_LANE_PREFIX)?.takeIf { it.isNotBlank() }
}

/**
 * `DELETE_MESSAGE`: deletes the message for everyone. Only an ACCEPTED deletion lets the end-to-end plaintext leave the
 * vault (#14656, iOS `confirmDeletion`). An exhausted deletion (refused in clear for an end-to-end conversation, #13790,
 * or retries spent) lifts its optimistic tombstone — the plaintext, never erased, reads again — then refreshes the
 * conversation of its lane, so the bubble gives way to the server's message.
 */
public class DeleteMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val messageRepository: MessageRepository,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val result = apiCall { messageApi.delete(row.targetId) }.toSendResult(PlaintextRefusal.laneConversation(row.lane), ledger)
        if (result == SendResult.Success) messageRepository.confirmDeletion(row.targetId)
        return result
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        messageRepository.markUndeleted(row.targetId)
        PlaintextRefusal.laneConversation(row.lane)?.let { messageRepository.refresh(it) }
    }
}

/**
 * `PIN_MESSAGE`: pins the message in its conversation. An exhausted pin refreshes the
 * conversation so the optimistic `pinnedAt` flip is reconciled with the server truth.
 */
public class PinMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<PinPayload>(row) { payload ->
            apiCall { messageApi.pin(payload.conversationId, row.targetId) }.toSendResult(payload.conversationId, ledger)
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        refreshPinnedConversation(json, messageRepository, row)
    }
}

/** `UNPIN_MESSAGE`: unpins the message; an exhausted unpin reconciles like [PinMessageHandler]. */
public class UnpinMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<PinPayload>(row) { payload ->
            apiCall { messageApi.unpin(payload.conversationId, row.targetId) }.toSendResult(payload.conversationId, ledger)
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        refreshPinnedConversation(json, messageRepository, row)
    }
}

/**
 * `CONSUME_AFTER_READ` (#13995) : la flamme-œil vue puis quittée disparaît chez ce lecteur — l'effet
 * local est déjà posé, le serveur l'applique à ses autres appareils (`message:expired`). Rien à défaire.
 */
public class ConsumeAfterReadHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ConsumeAfterReadPayload>(row) { payload ->
            apiCall { messageApi.consumeAfterRead(row.targetId, ConsumeAfterReadRequest(ReadListBounds.cappedIds(payload.messageIds))) }.toSendResult(row.targetId)
        }
}

/** `CONSUME_VIEW_ONCE` (#13995) : la vue unique lue et refermée consomme son compteur serveur. */
public class ConsumeViewOnceHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ConsumeViewOncePayload>(row) { payload ->
            apiCall { messageApi.consumeViewOnce(payload.conversationId, row.targetId) }.toSendResult(payload.conversationId)
        }
}

private suspend fun refreshPinnedConversation(
    json: Json,
    messageRepository: MessageRepository,
    row: OutboxEntity,
) {
    runCatching { json.decodeFromString<PinPayload>(row.payload) }
        .getOrNull()
        ?.let { messageRepository.refresh(it.conversationId) }
}

@Module
@InstallIn(SingletonComponent::class)
public interface MessageSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.SEND_MESSAGE)
    public fun sendMessage(handler: SendMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.EDIT_MESSAGE)
    public fun editMessage(handler: EditMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.DELETE_MESSAGE)
    public fun deleteMessage(handler: DeleteMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.PIN_MESSAGE)
    public fun pinMessage(handler: PinMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UNPIN_MESSAGE)
    public fun unpinMessage(handler: UnpinMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.CONSUME_AFTER_READ)
    public fun consumeAfterRead(handler: ConsumeAfterReadHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.CONSUME_VIEW_ONCE)
    public fun consumeViewOnce(handler: ConsumeViewOnceHandler): OutboxKindHandler
}
