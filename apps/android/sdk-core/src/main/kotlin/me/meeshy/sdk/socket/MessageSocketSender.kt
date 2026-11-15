package me.meeshy.sdk.socket

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.model.socket.SendMessageAck
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckPayloadSource
import me.meeshy.sdk.model.socket.SocketAckRefusal
import me.meeshy.sdk.model.socket.SocketSendFallbackPolicy
import me.meeshy.sdk.model.socket.SocketSendPayloads
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/** L'issue d'un repli socket : l'appelant décide de la ligne d'outbox, jamais ce module. */
sealed interface MessageSocketOutcome {
    /** La passerelle a créé le message : [ack] réconcilie la bulle. */
    data class Acked(val ack: SendMessageAck) : MessageSocketOutcome

    /** Rien n'a été émis (texte chiffré sans pièce jointe, citation de pièce) : la ligne reste en file. */
    data object NotSent : MessageSocketOutcome

    /** Refus de la passerelle. [definitive] : conversation fermée, non-participant — la ligne est abandonnée. */
    data class Refused(val refusal: SocketAckRefusal, val definitive: Boolean) : MessageSocketOutcome

    /** Pas de socket, pas d'accusé en 10 s, ou accusé illisible : la ligne reste en file. */
    data object Unanswered : MessageSocketOutcome
}

/** Le repli socket de l'envoi d'un message ; [None] est la couture inerte. */
fun interface MessageSocketSending {
    suspend fun send(conversationId: String, request: SendMessageRequest): MessageSocketOutcome

    companion object {
        val None: MessageSocketSending = MessageSocketSending { _, _ -> MessageSocketOutcome.NotSent }
    }
}

/**
 * Miroir de `sendViaSocketFallback` (iOS) : émet `message:send` ou `message:send-with-attachments` avec le MÊME
 * `clientMessageId` que le REST et attend l'accusé 10 s. La charge vient de [SocketSendPayloads] (fail-closed).
 */
@Singleton
class MessageSocketSender internal constructor(
    private val acks: SocketAckEmitter,
    private val timeoutMs: Long = ACK_TIMEOUT_MS,
) : MessageSocketSending {

    @Inject
    constructor(socketManager: SocketManager) : this(SocketAckEmitter(socketManager), ACK_TIMEOUT_MS)

    override suspend fun send(conversationId: String, request: SendMessageRequest): MessageSocketOutcome {
        val payload = SocketSendPayloads.from(conversationId, request) ?: return MessageSocketOutcome.NotSent
        val ack = acks.emitWithAck(
            event = payload.event,
            payload = JSONObject(payload.body.toString()),
            timeoutMs = timeoutMs,
            payloadAt = SocketAckPayloadSource.DATA,
        ) { SendMessageAck.from(it, request.clientMessageId) }
        return when (ack) {
            is SocketAck.Accepted -> ack.payload?.let(MessageSocketOutcome::Acked) ?: MessageSocketOutcome.Unanswered
            is SocketAck.Refused -> MessageSocketOutcome.Refused(ack.refusal, SocketSendFallbackPolicy.isDefinitive(ack.refusal))
            SocketAck.Timeout -> MessageSocketOutcome.Unanswered
        }
    }

    companion object {
        const val ACK_TIMEOUT_MS: Long = 10_000
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface MessageSocketSenderModule {
    @Binds
    fun messageSocketSending(sender: MessageSocketSender): MessageSocketSending
}
