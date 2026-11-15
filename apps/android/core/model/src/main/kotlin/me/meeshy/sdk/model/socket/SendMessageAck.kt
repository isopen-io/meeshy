package me.meeshy.sdk.model.socket

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.send.AttachmentRightRefusal

/**
 * L'accusé de `message:send` / `message:send-with-attachments` (miroir de `SendMessageAck`, iOS) : l'identifiant
 * serveur, le `clientMessageId` écho (absent d'une vieille passerelle, repris de la requête) et l'horloge SERVEUR.
 */
data class SendMessageAck(
    val messageId: String,
    val clientMessageId: String?,
    val createdAt: String? = null,
) {
    companion object {
        /** Lit la charge `data` de l'accusé ; `null` sans `messageId` exploitable. */
        fun from(payload: JsonObject?, requestClientMessageId: String): SendMessageAck? {
            payload ?: return null
            val messageId = payload.text("messageId")?.takeIf { it.isNotBlank() } ?: return null
            return SendMessageAck(
                messageId = messageId,
                clientMessageId = payload.text("clientMessageId") ?: requestClientMessageId,
                createdAt = payload.text("createdAt")?.takeIf { it.isNotBlank() },
            )
        }

        private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
    }
}

/** La bulle optimiste devient le message serveur : son identifiant et son horloge, tout le reste est déjà juste. */
fun ApiMessage.acknowledgedBy(ack: SendMessageAck): ApiMessage =
    copy(id = ack.messageId, createdAt = ack.createdAt ?: createdAt)

/**
 * Quand l'échec du REST autorise le repli socket : un échec de transport (`NETWORK`, aucun statut) ou un 5xx — jamais un 4xx,
 * que la socket rejouerait à l'identique. Un refus DÉFINITIF de la socket (conversation fermée, non-participant, droit de pièce jointe #16053) abandonne la ligne.
 */
object SocketSendFallbackPolicy {
    private const val NETWORK_CODE = "NETWORK"

    fun allowsFallback(httpStatus: Int?, code: String?): Boolean =
        if (httpStatus == null) code == NETWORK_CODE else httpStatus in 500..599

    fun isDefinitive(refusal: SocketAckRefusal): Boolean =
        refusal.code == SocketAckCodes.CONVERSATION_CLOSED || refusal.code == SocketAckCodes.NOT_A_PARTICIPANT ||
            AttachmentRightRefusal.isCode(refusal.code)
}
