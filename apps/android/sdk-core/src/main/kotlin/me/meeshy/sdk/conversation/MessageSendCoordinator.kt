package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import java.time.Instant
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaAdoption
import me.meeshy.sdk.media.PendingMediaPreviewing
import me.meeshy.sdk.media.MediaLocationRefusal
import me.meeshy.sdk.model.ConversationWriteRestriction
import me.meeshy.sdk.media.MediaLoss
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsEncoder
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.send.MessageRelation
import me.meeshy.sdk.model.send.OutgoingAttachments
import me.meeshy.sdk.model.send.OutgoingMessage
import me.meeshy.sdk.model.send.SendAttemptContext
import me.meeshy.sdk.model.socket.SendMessageAck
import me.meeshy.sdk.model.socket.acknowledgedBy
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.media.OutgoingAttachmentRules
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxEnqueueResult
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.session.AccountClosedException

/**
 * The send lifecycle of one outgoing message (ARCHITECTURE.md §5): the optimistic `SENDING`
 * bubble and its queued `SEND_MESSAGE`, the server ACK that replaces it, the outbox giving up,
 * and the user's retry. One domain — the local `cid_` row from birth to reconciliation.
 */
internal class MessageSendCoordinator(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val outboxRepository: OutboxRepository,
    private val clock: CacheClock,
    /** #13792 — l'accusé d'envoi nourrit le registre des régimes comme tout message servi. */
    private val regime: EndToEndRegimeKeeper? = null,
    /** #14890 — à l'accusé, le fichier local d'un média envoyé rejoint le cache typé sous son adresse canonique. */
    private val adoption: MediaAdoption? = null,
    /** #15104 — l'aperçu local d'un média en attente part avec sa bulle : accusé, annulation, retrait. */
    private val previews: PendingMediaPreviewing? = null,
    /** L'aperçu de la liste suit mon envoi : posé à l'envoi optimiste, recalculé quand la bulle est retirée. */
    listPreviews: SendPreviewSink? = null,
) {
    private val stager = OptimisticMessageStager(database, messageDao, listPreviews)

    /**
     * Optimistic send: the message appears instantly as a `SENDING` bubble backed by Room, and a
     * `SEND_MESSAGE` mutation is queued on the conversation's FIFO outbox lane. Returns the
     * bubble's id.
     *
     * **Cet identifiant est un `cid_`, jamais un `cmid_`** (#4624). Il porte QUATRE roles, et ils
     * ne sont pas separables : id de la ligne Room, corps `clientMessageId` envoye au gateway, cle
     * de la ligne d'outbox (que `reconcileSent` reinjecte dans `deleteByIds`) et — le role qui les
     * scelle — identifiant LOCAL par lequel `MessageCacheSource.persist` purge la bulle optimiste,
     * en lisant le `clientMessageId` que le SERVEUR renvoie. Les quatre partagent donc une valeur,
     * et le serveur impose son format : `^cid_<uuid v4 minuscule>` aux trois portes (REST, socket,
     * lien anonyme). `OutboxIds.cmid()` produisait un prefixe que les trois rejetaient en 400 —
     * aucun message ne partait d'Android.
     *
     * [clientMessageId] : un `cid_` fourni par l'appelant (un partage le DERIVE de son geste, destinataire et rang : stable
     * au rejeu). Une bulle deja nee sous ce `cid_` n'est ni reecrite ni remise en file ; un `cid_` mal forme est refuse.
     *
     * Le `cmid` reste la cle des mutations qui ne sont PAS des messages (amis, preferences,
     * televersements de media) : il ne voyage pas sur ce fil-ci.
     */
    suspend fun sendOptimistic(
        conversationId: String,
        content: String,
        originalLanguage: String,
        sender: MeeshyUser,
        replyToId: String? = null,
        storyReplyToId: String? = null,
        forwardedFromId: String? = null,
        forwardedFromConversationId: String? = null,
        effects: MessageEffects = MessageEffects(),
        messageType: String = "text",
        attachmentUploadCmids: List<String> = emptyList(),
        attachments: List<ApiMessageAttachment> = emptyList(),
        location: SharedPlace? = null,
        forwardedAttachmentIds: List<String>? = null,
        sticker: MessageSticker? = null,
        clientMessageId: String? = null,
        attachmentReplyToId: String? = null,
        copyAttachmentsFromMessageId: String? = null,
    ): String {
        require(clientMessageId == null || OutboxIds.isValidCid(clientMessageId)) { "clientMessageId must be a cid_ id" }
        val cid = clientMessageId ?: OutboxIds.cid()
        // A replay of the same share (reopened sheet, retry after a partial series) finds its bubble: nothing is born twice.
        if (clientMessageId != null && messageDao.find(cid) != null) return cid
        val ticket = outboxRepository.currentTicket()
        val now = clock.nowMillis()
        val wire = MessageEffectsEncoder.encode(effects, Instant.ofEpochMilli(now))
        // A queued send references each prerequisite upload by its cmid until the
        // drainer grafts the real gateway id in (MessageMediaWriteBack); an empty
        // list keeps a text-only send exactly as before (null attachmentIds).
        val placeholderIds = attachmentUploadCmids.filter { it.isNotBlank() }.distinct()
        // Fan-out de partage : la cible 2..N dépend de la ligne de son origine (son `cid_`), qui greffe l'id serveur à l'accusé.
        val fanoutOrigin = copyAttachmentsFromMessageId?.takeIf { OutboxIds.isValidCid(it) && it != cid }
        val chosenPieces = forwardedAttachmentIds?.filter { it.isNotBlank() }?.distinct()?.takeIf { it.isNotEmpty() }
        val optimistic = ApiMessage(
            id = cid,
            conversationId = conversationId,
            senderId = sender.id,
            content = content,
            messageType = messageType,
            originalLanguage = originalLanguage,
            replyToId = replyToId,
            storyReplyToId = storyReplyToId,
            createdAt = Instant.ofEpochMilli(now).toString(),
            sender = ApiMessageSender(
                userId = sender.id,
                displayName = sender.displayName,
                username = sender.username,
                avatar = sender.avatar,
            ),
            clientMessageId = cid,
            attachments = attachments,
            location = location,
            sticker = sticker,
            forwardedFromId = forwardedFromId,
            forwardedFromConversationId = forwardedFromConversationId,
            metadata = SendTrace(
                forwardedAttachmentIds = chosenPieces,
                ephemeralDuration = wire.ephemeralDuration,
                attachmentReplyToId = attachmentReplyToId,
                copyAttachmentsFromMessageId = copyAttachmentsFromMessageId,
            ).stamp(),
            effectFlags = wire.effectFlags,
            isBlurred = wire.isBlurred,
            isViewOnce = wire.isViewOnce,
            expiresAt = wire.expiresAt,
        )
        val outgoing = OutgoingMessage(
            conversationId = conversationId,
            content = content,
            relation = MessageRelation.legacy(
                replyToId, storyReplyToId, forwardedFromId, forwardedFromConversationId, attachmentReplyToId,
            ),
            attachments = OutgoingAttachments(placeholderIds.ifEmpty { null }),
            messageType = messageType,
            location = location,
            sticker = sticker,
            copyAttachmentsFromMessageId = copyAttachmentsFromMessageId,
            forwardedAttachmentIds = chosenPieces,
        )
        // #7451 — la requête ne porte que la durée et le bit ; l'échéance locale reste sur la bulle d'affichage.
        val request = outgoing.wireRequest(
            SendAttemptContext(cid, now, effects, originalLanguage, reusesExistingRow = clientMessageId != null),
            content = content,
        )
        stager.stage(optimistic, now)
        try {
            val queued = outboxRepository.tryEnqueue(
                OutboxMutation(
                    kind = OutboxKind.SEND_MESSAGE,
                    lane = OutboxLanes.forMessage(conversationId),
                    targetId = conversationId,
                    payload = MeeshyApi.json.encodeToString(request),
                    dependsOn = placeholderIds.toSet() + listOfNotNull(fanoutOrigin),
                    cmid = cid,
                ),
                ticket,
            )
            if (queued is OutboxEnqueueResult.QueueFull) markSendFailed(cid)
        } catch (closed: AccountClosedException) {
            stager.withdraw(cid)
            throw closed
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            withContext(NonCancellable) { stager.failEnqueue(cid, failure) }
        }
        return cid
    }

    /**
     * Server ACK for an optimistic send: atomically replaces the local `cmid`
     * row with the authoritative server message — no flicker, no duplicate.
     */
    suspend fun reconcileSent(cmid: String, serverMessage: ApiMessage) {
        val now = clock.nowMillis()
        val optimisticAttachments = optimisticAttachmentsOf(cmid)
        database.withTransaction {
            DedicatedTranslationRows.rekey(database, cmid, serverMessage, optimisticAttachments, now)
            messageDao.deleteByIds(listOf(cmid))
            messageDao.upsertAll(listOf(MessageEntityFactory.cached(serverMessage, now)))
            MessageIdReconciliation.recordAck(database, cmid, serverMessage.id, serverMessage.conversationId, now)
        }
        TranslationLayer.of(database).forget(listOf(cmid))
        regime?.learnFromServed(listOf(serverMessage))
        adoption?.adopt(optimisticAttachments, serverMessage.attachments)
        previews?.release(optimisticAttachments)
    }

    /** Le pont `cid_ -> id serveur` écrit à l'accusé ([MessageIdReconciliation.recordAck]) ; `null` tant que non acquitté. */
    suspend fun serverIdOf(localId: String): String? = database.pendingIdDao().byLocalId(localId)?.serverId

    /**
     * Accusé de la SOCKET (repli du REST) : il ne porte que `messageId` et `createdAt`, la bulle optimiste fournit le reste.
     * Même réconciliation atomique que [reconcileSent] — la bulle devient le message serveur, sans doublon. Une bulle déjà
     * remplacée (le `message:new` est arrivé le premier) n'a plus rien à réconcilier.
     */
    suspend fun reconcileAcknowledged(cmid: String, ack: SendMessageAck) {
        val bubble = messageDao.find(cmid)?.let { runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(it.payload) }.getOrNull() } ?: return
        reconcileSent(cmid, bubble.acknowledgedBy(ack))
    }

    /** Retire la bulle optimiste [cmid] et, avec elle, les aperçus locaux de ses médias. */
    private suspend fun dropBubble(cmid: String) {
        val optimisticAttachments = previews?.let { optimisticAttachmentsOf(cmid) }.orEmpty()
        stager.withdraw(cmid)
        previews?.release(optimisticAttachments)
    }

    private suspend fun optimisticAttachmentsOf(cmid: String): List<ApiMessageAttachment> =
        messageDao.find(cmid)?.let { row ->
            runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(row.payload).attachments }.getOrNull()
        }.orEmpty()

    /**
     * The outbox exhausted its retries — surface the bubble as retryable. A send refused because a media's
     * location cannot be removed ([MediaLocationRefusal], #13550), or whose media was lost on the device ([MediaLoss], #13554),
     * keeps that reason on the bubble, which says it.
     */
    suspend fun markSendFailed(cmid: String, reason: String? = null) {
        val row = messageDao.find(cmid)
        if (row == null || !isDefinitive(reason)) {
            messageDao.updateSendState(cmid, LocalSendState.FAILED.name)
            return
        }
        messageDao.recordSendAttempt(cmid, LocalSendState.FAILED.name, row.retryCount, reason)
    }

    /**
     * User-initiated retry of a failed bubble: flips it back to `SENDING` and
     * revives its outbox row (or re-enqueues from the cached payload when the
     * row is gone). A bubble refused for its location, or whose media was lost (#13554), is never retried — the same bytes would be refused
     * again: the tap REMOVES it (bubble and outbox row), so the author can pick another file (#13550). Its exhausted uploads are
     * revived with it (#13820): a bubble that gave up waiting for its conversation's mode resends its kept bytes.
     */
    suspend fun retrySend(cmid: String) {
        val row = messageDao.find(cmid) ?: return
        if (isDefinitive(row.lastError)) {
            outboxRepository.discard(cmid)
            dropBubble(cmid)
            return
        }
        messageDao.updateSendState(cmid, LocalSendState.SENDING.name)
        if (outboxRepository.retryWithPrerequisites(cmid)) return
        val message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
        val trace = SendTrace.read(message)
        val outgoing = OutgoingMessage(
            conversationId = message.conversationId,
            content = message.content,
            relation = MessageRelation.legacy(
                message.replyToId, message.storyReplyToId, message.forwardedFromId,
                message.forwardedFromConversationId, trace.attachmentReplyToId,
            ),
            messageType = message.messageType,
            location = message.location,
            sticker = message.sticker,
            copyAttachmentsFromMessageId = trace.copyAttachmentsFromMessageId,
            forwardedAttachmentIds = trace.forwardedAttachmentIds,
        )
        val effects = message.effects.copy(ephemeralDuration = trace.ephemeralDuration)
        val context = SendAttemptContext(
            cmid, clock.nowMillis(), effects, message.originalLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
            reusesExistingRow = true,
        )
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_MESSAGE,
                lane = OutboxLanes.forMessage(message.conversationId),
                targetId = message.conversationId,
                payload = MeeshyApi.json.encodeToString(outgoing.wireRequest(context, content = message.content)),
                cmid = cmid,
            ),
        )
    }

    /**
     * Met en file l'envoi d'une bulle DÉJÀ posée au tap (groupe de pièces, texte, lieu) sous son `cid_` : le message réutilise
     * l'identifiant de la bulle optimiste, sans en créer une seconde. [attachmentIds] sont les identifiants serveur des pièces
     * montées, ou les `cmid` de leurs téléversements durables que le drainer greffera ([dependsOn]). Rend `false` si la bulle
     * a disparu ou si la file est pleine (la bulle passe alors en échec).
     */
    suspend fun sendPostedBubble(cid: String, attachmentIds: List<String> = emptyList(), dependsOn: Set<String> = emptySet()): Boolean {
        val row = messageDao.find(cid) ?: return false
        val message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
        val trace = SendTrace.read(message)
        val placeholders = attachmentIds.filter { it.isNotBlank() }.distinct()
        val outgoing = OutgoingMessage(
            conversationId = message.conversationId,
            content = message.content,
            relation = MessageRelation.legacy(
                message.replyToId, message.storyReplyToId, message.forwardedFromId,
                message.forwardedFromConversationId, trace.attachmentReplyToId,
            ),
            attachments = OutgoingAttachments(placeholders.ifEmpty { null }),
            messageType = message.messageType,
            location = message.location,
            sticker = message.sticker,
            copyAttachmentsFromMessageId = trace.copyAttachmentsFromMessageId,
            forwardedAttachmentIds = trace.forwardedAttachmentIds,
        )
        val effects = message.effects.copy(ephemeralDuration = trace.ephemeralDuration)
        val context = SendAttemptContext(
            cid, clock.nowMillis(), effects, message.originalLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
            reusesExistingRow = true,
        )
        val queued = outboxRepository.tryEnqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_MESSAGE,
                lane = OutboxLanes.forMessage(message.conversationId),
                targetId = message.conversationId,
                payload = MeeshyApi.json.encodeToString(outgoing.wireRequest(context, content = message.content)),
                dependsOn = dependsOn,
                cmid = cid,
            ),
            outboxRepository.currentTicket(),
        )
        if (queued is OutboxEnqueueResult.QueueFull) {
            markSendFailed(cid)
            return false
        }
        return true
    }

    /** Relance la bulle en échec [cmid] — son état repasse à l'envoi, sa ligne et ses téléversements repartent. */
    suspend fun retryByClientMessageId(cmid: String) = retrySend(cmid)

    /** Relance tous les envois en échec du compte : chaque bulle relancée repasse à l'envoi. */
    suspend fun retryAllFailed(): Int {
        val revived = outboxRepository.retryAll()
        revived.forEach { messageDao.updateSendState(it, LocalSendState.SENDING.name) }
        return revived.size
    }

    /**
     * L'utilisateur annule l'envoi EN ATTENTE [cmid] : sa ligne d'outbox ET sa bulle optimiste disparaissent. Un envoi déjà
     * parti (en vol) n'est pas annulé — sa bulle reste.
     */
    suspend fun cancelPendingSend(cmid: String) {
        if (outboxRepository.cancelPendingSend(cmid)) dropBubble(cmid)
    }

    /** Retire la ligne d'outbox d'un envoi échoué (quel que soit son état sauf en vol) et sa bulle optimiste. */
    suspend fun clearSendMessageRow(cmid: String) {
        if (outboxRepository.row(cmid)?.state == OutboxState.INFLIGHT.name) return
        outboxRepository.clearSendMessageRow(cmid)
        dropBubble(cmid)
    }

    private fun isDefinitive(reason: String?): Boolean =
        MediaLocationRefusal.isReason(reason) || MediaLoss.isReason(reason) || OutgoingAttachmentRules.isDefinitiveReason(reason) || ConversationWriteRestriction.fromReason(reason) != null
}
