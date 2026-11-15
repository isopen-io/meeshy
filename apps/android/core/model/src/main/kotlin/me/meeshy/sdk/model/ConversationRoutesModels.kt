package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Corps de `POST /conversations/{id}/receipts` : l'écriture UNIQUE des accusés (`read` | `received` | `delivered`).
 * [messageIds] absent = la fenêtre entière côté serveur (le corps vide des clients déjà distribués).
 */
@Serializable
data class ReceiptWriteRequest(val type: String, val messageIds: List<String>? = null) {
    companion object {
        const val READ: String = "read"
        const val RECEIVED: String = "received"
        const val DELIVERED: String = "delivered"
    }
}

/** `data` de l'écriture d'un accusé : les entrées RÉELLEMENT figées, et le badge APRÈS marquage. */
@Serializable
data class ReceiptWriteResult(
    val type: String? = null,
    val markedCount: Int = 0,
    val unreadCount: Int = 0,
)

/**
 * Une ligne de `GET …/receipts?detail=summary` (et de `GET …/read-statuses`) : les compteurs d'UN message.
 * `totalMembers` exclut l'expéditeur : c'est donc le dénominateur de [DeliveryStatusResolver].
 */
@Serializable
data class ReceiptSummaryRow(
    val totalMembers: Int = 0,
    val receivedCount: Int = 0,
    val readCount: Int = 0,
    val deliveredToAllAt: String? = null,
    val readByAllAt: String? = null,
) {
    /** La coche de la bulle de l'expéditeur : ✓ envoyé, ✓✓ reçu, ✓✓ lu (tout-ou-rien en groupe). */
    fun deliveryTier(showReadReceipts: Boolean = true): DeliveryTier = DeliveryStatusResolver.resolve(
        deliveredCount = receivedCount,
        readCount = readCount,
        recipientCount = totalMembers,
        deliveredToAllAt = deliveredToAllAt,
        readByAllAt = readByAllAt,
        showReadReceipts = showReadReceipts,
    )
}

/** Une personne de `GET …/receipts?detail=people`. */
@Serializable
data class ReceiptPersonRow(
    val participantId: String,
    val displayName: String = "",
    val avatar: String? = null,
    val deliveredAt: String? = null,
    val receivedAt: String? = null,
    val readAt: String? = null,
    val readDevice: String? = null,
)

@Serializable
data class ReceiptsPagination(
    val total: Int = 0,
    val limit: Int = 0,
    val offset: Int = 0,
    val hasMore: Boolean = false,
    val nextCursor: String? = null,
)

/** `data` de `GET …/receipts` : `summary` (par message) ou `people` (page nominative). */
@Serializable
data class ReceiptsPayload(
    val detail: String = "summary",
    val messageIds: List<String> = emptyList(),
    val summary: Map<String, ReceiptSummaryRow> = emptyMap(),
    val people: List<ReceiptPersonRow> = emptyList(),
    val pagination: ReceiptsPagination? = null,
)

/**
 * La coche par message, prête pour les bulles : tout message absent de la réponse reste à [DeliveryTier.Sent].
 */
fun ReceiptsPayload.tiersByMessage(showReadReceipts: Boolean = true): Map<String, DeliveryTier> =
    summary.mapValues { (_, row) -> row.deliveryTier(showReadReceipts) }

/** Corps de `POST /conversations/{id}/clear-history` : tout ce qui précède [beforeDate] (ISO-8601) disparaît chez moi. */
@Serializable
data class ClearHistoryRequest(val beforeDate: String)

/** Corps de `POST /conversations/{id}/invite` : un inscrit ajouté par un membre. */
@Serializable
data class InviteConversationMemberRequest(val userId: String)

/** Corps de `DELETE /messages/bulk/delete-for-me` : 1 à N messages masqués chez moi seul. */
@Serializable
data class BulkHideForMeRequest(val messageIds: List<String>)

/** Corps de `POST /conversations/{id}/messages/capture` (#9617) : au plus [MAX_MESSAGES] messages, une nature de capture. */
@Serializable
data class ContentCaptureRequest(
    val messageIds: List<String>,
    val kind: String,
    val captureId: String? = null,
) {
    companion object {
        const val MAX_MESSAGES: Int = 50
    }
}

/** `data` de la déclaration de capture : les messages dont le fil a été averti. */
@Serializable
data class ContentCaptureResult(val noticedMessageIds: List<String> = emptyList())

/**
 * Corps de `POST /conversations/{id}/new-link`. Tout champ est facultatif : la passerelle applique ses défauts.
 * Soumise à la porte e-mail (compte vérifié) côté serveur.
 */
@Serializable
data class NewShareLinkRequest(
    val name: String? = null,
    val description: String? = null,
    val maxUses: Int? = null,
    val maxConcurrentUsers: Int? = null,
    val maxUniqueSessions: Int? = null,
    val expiresAt: String? = null,
    val allowAnonymousMessages: Boolean? = null,
    val allowAnonymousFiles: Boolean? = null,
    val allowAnonymousImages: Boolean? = null,
    val allowViewHistory: Boolean? = null,
    val requireAccount: Boolean? = null,
    val requireNickname: Boolean? = null,
    val requireEmail: Boolean? = null,
    val requireBirthday: Boolean? = null,
)
