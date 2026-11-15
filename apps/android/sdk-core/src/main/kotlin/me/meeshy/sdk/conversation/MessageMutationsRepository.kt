package me.meeshy.sdk.conversation

import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.outbox.MarkReceivedPayload
import me.meeshy.sdk.outbox.MessageHidingPayload
import me.meeshy.sdk.outbox.ModerationDeletePayload
import me.meeshy.sdk.outbox.OutboxChatLanes
import me.meeshy.sdk.outbox.OutboxEnqueueResult
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.RemoveAttachmentPayload

/** Ce que devient un geste confié à [MessageMutationsRepository]. */
public enum class ChatMutationAdmission {
    /** Le geste est en file : il part à la reconnexion, ou tout de suite en ligne. */
    QUEUED,

    /** Le geste a annulé son contraire encore en file (masquer puis restaurer) : rien ne partira. */
    CANCELLED_OUT,

    /** La file est pleine, ou le geste est vide : rien n'est en file et l'effet local est défait. */
    REFUSED,
}

/**
 * L'API UNIQUE des actions de message faites hors ligne : « supprimer pour moi », restaurer, retirer une pièce, retrait par
 * la modération avec motif, accusé de réception. Chaque geste suit la même suite — instantané, effet local, ligne d'outbox,
 * retour arrière au refus définitif (les envoyeurs de `outbox/senders/ChatMessageActionSenders.kt`) — de sorte qu'aucun
 * écran n'écrit plus jamais sa propre variante.
 *
 * ## Quota des accusés
 * `mark-as-received` (la route de [markReceived]), `mark-as-read`, `…/receipts` et `…/delivery-receipt` PARTAGENT le même
 * débit côté passerelle : 120 écritures par minute et par COMPTE (`createReceiptWriteRateLimitConfig`, relevé de 30 à 120
 * parce qu'une conversation animée épuisait seule le quota et faisait rejeter des accusés de LECTURE). Un 429 est
 * transitoire : la ligne reste en file et repart après le délai servi. [markReceived] se COALESCE par conversation —
 * une rafale de messages entrants ne pose jamais plus d'un accusé en attente.
 */
@Singleton
public class MessageMutationsRepository @Inject constructor(
    private val outbox: OutboxRepository,
    private val messages: MessageRepository,
    private val json: Json,
) {

    /** « Supprimer pour moi » : la bulle disparaît tout de suite chez moi seul ; un refus définitif la rend. */
    public suspend fun hideForMe(conversationId: String, messageId: String): ChatMutationAdmission {
        messages.markDeleted(messageId, Instant.now().toString())
        val admission = admit(
            OutboxMutation(
                kind = OutboxKind.HIDE_FOR_ME,
                lane = OutboxChatLanes.PERSONAL_HIDING,
                targetId = messageId,
                payload = json.encodeToString(MessageHidingPayload.serializer(), MessageHidingPayload(conversationId)),
            ),
        )
        if (admission != ChatMutationAdmission.QUEUED) restore(conversationId, messageId)
        return admission
    }

    /** Le geste inverse. S'il rencontre son masquage encore en file, les deux s'annulent et le message se relève. */
    public suspend fun restoreForMe(conversationId: String, messageId: String): ChatMutationAdmission {
        val admission = admit(
            OutboxMutation(
                kind = OutboxKind.RESTORE_FOR_ME,
                lane = OutboxChatLanes.PERSONAL_HIDING,
                targetId = messageId,
                payload = json.encodeToString(MessageHidingPayload.serializer(), MessageHidingPayload(conversationId)),
            ),
        )
        if (admission == ChatMutationAdmission.CANCELLED_OUT) restore(conversationId, messageId)
        return admission
    }

    /** Retire UNE pièce d'un message déjà accusé ; un refus définitif relit le message, la pièce revient. */
    public suspend fun removeAttachment(conversationId: String, messageId: String, attachmentId: String): ChatMutationAdmission =
        admit(
            OutboxMutation(
                kind = OutboxKind.REMOVE_ATTACHMENT,
                lane = OutboxChatLanes.CONTENT_REMOVAL,
                targetId = attachmentId,
                payload = json.encodeToString(
                    RemoveAttachmentPayload.serializer(),
                    RemoveAttachmentPayload(conversationId, messageId),
                ),
            ),
        )

    /**
     * Le retrait d'un message par la modération. Le motif est rogné ; un motif vide n'est pas une modération
     * ([ChatMutationAdmission.REFUSED], rien n'est touché) — le retrait ordinaire passe par `DELETE_MESSAGE`.
     */
    public suspend fun moderationDelete(conversationId: String, messageId: String, reason: String): ChatMutationAdmission {
        val request = ContentRemovalRequest.forReason(reason) ?: return ChatMutationAdmission.REFUSED
        messages.markDeleted(messageId, Instant.now().toString())
        val admission = admit(
            OutboxMutation(
                kind = OutboxKind.MODERATION_DELETE,
                lane = OutboxChatLanes.CONTENT_REMOVAL,
                targetId = messageId,
                payload = json.encodeToString(
                    ModerationDeletePayload.serializer(),
                    ModerationDeletePayload(conversationId, request.reason),
                ),
            ),
        )
        if (admission != ChatMutationAdmission.QUEUED) restore(conversationId, messageId)
        return admission
    }

    /** L'accusé de RÉCEPTION de la conversation (la double coche de l'expéditeur) ; voir le quota en tête de classe. */
    public suspend fun markReceived(conversationId: String): ChatMutationAdmission =
        admit(
            OutboxMutation(
                kind = OutboxKind.MARK_RECEIVED,
                lane = OutboxLanes.READ_RECEIPT,
                targetId = conversationId,
                payload = json.encodeToString(MarkReceivedPayload.serializer(), MarkReceivedPayload(conversationId)),
            ),
        )

    private suspend fun admit(mutation: OutboxMutation): ChatMutationAdmission =
        when (outbox.tryEnqueue(mutation)) {
            is OutboxEnqueueResult.Accepted -> ChatMutationAdmission.QUEUED
            OutboxEnqueueResult.Annihilated -> ChatMutationAdmission.CANCELLED_OUT
            is OutboxEnqueueResult.QueueFull -> ChatMutationAdmission.REFUSED
        }

    private suspend fun restore(conversationId: String, messageId: String) {
        messages.markUndeleted(messageId)
        messages.refresh(conversationId)
    }
}
