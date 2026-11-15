package me.meeshy.sdk.share

import java.io.File
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.conversation.MessageForwardService
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.media.PendingMediaPreviewing
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.share.OutgoingShare
import me.meeshy.sdk.model.share.SharePendingShare
import me.meeshy.sdk.model.share.SharePendingTarget
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareStagedMedia
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import me.meeshy.sdk.outbox.OutboxIds

/** Ce que l'envoi durable emporte : un texte et/ou des fichiers, envoyés comme UN message par destinataire. */
public data class ShareDurableRequest(
    val shareId: String,
    val content: String?,
    val files: List<MediaUploadItem>,
    val sender: MeeshyUser,
    val previews: PendingMediaPreviewing = PendingMediaPreviewing.None,
)

/** La porte que l'écran de partage franchit pour un envoi qui doit arriver à coup sûr. */
public interface ShareDurableSending {
    /** Faux pour la couture inerte : l'appelant garde son chemin direct. */
    public val isAvailable: Boolean

    public suspend fun send(
        request: ShareDurableRequest,
        recipients: List<ShareRecipient>,
        onOutcome: suspend (ShareRecipient, ShareDeliveryOutcome) -> Unit = { _, _ -> },
    ): Map<String, ShareDeliveryOutcome>

    public companion object {
        public val None: ShareDurableSending = object : ShareDurableSending {
            override val isAvailable: Boolean = false
            override suspend fun send(
                request: ShareDurableRequest,
                recipients: List<ShareRecipient>,
                onOutcome: suspend (ShareRecipient, ShareDeliveryOutcome) -> Unit,
            ): Map<String, ShareDeliveryOutcome> = emptyMap()
        }
    }
}

/** Ce qu'il advient d'UNE cible de la fiche. */
internal sealed interface ShareServeOutcome {
    data class Served(val queued: Boolean) : ShareServeOutcome

    /** Transitoire : la cible reste dans la fiche, la reprise réessaie. */
    data object Deferred : ShareServeOutcome

    /** Refus définitif : la cible quitte la fiche, la raison est dite à la ligne. */
    data class Refused(val failure: ShareFailure, val reason: ShareRefusalReason? = null) : ShareServeOutcome
}

/**
 * **L'envoi durable d'un partage** (#15791, miroir de `ExtensionShareDispatcher` + `SharePendingSendConsumer`, iOS).
 *
 * 1. Les lignes se résolvent d'abord (conversation retrouvée ou créée, mode de chiffrement relu) par le dispatcher.
 * 2. **La fiche s'écrit AVANT le premier octet** : copies des fichiers, puis [SharePendingShareStore.commit]. Un processus
 *    tué entre la fiche et l'enfilage ne perd rien, [resume] reprend les cibles non servies.
 * 3. Les cibles se servent l'une après l'autre, l'ORIGINE d'abord : elle téléverse les pièces une seule fois, les cibles
 *    2..N copient côté serveur (`copyAttachmentsFromMessageId`). Chaque cible est marquée servie et la fiche réécrite.
 * 4. Le `clientMessageId` de chaque cible est dérivé et persisté dans la fiche : un rejeu est idempotent.
 *
 * **Aucun champ de transfert** : ni `forwardedFromId` ni `forwardedFromConversationId`, jamais « Transféré depuis ».
 */
@Singleton
public class ShareDurableSender @Inject constructor(
    private val store: SharePendingShareStore,
    private val dispatcher: ShareDispatcher,
    private val gate: OutOfThreadSendGate,
    private val forwards: MessageForwardService,
    private val messages: MessageRepository,
    private val uploads: MediaUploadQueue,
    private val network: NetworkMonitor,
    private val scheduler: SharePendingSendScheduler,
) : ShareDurableSending {

    override val isAvailable: Boolean = true

    override suspend fun send(
        request: ShareDurableRequest,
        recipients: List<ShareRecipient>,
        onOutcome: suspend (ShareRecipient, ShareDeliveryOutcome) -> Unit,
    ): Map<String, ShareDeliveryOutcome> {
        val outcomes = LinkedHashMap<String, ShareDeliveryOutcome>()
        suspend fun report(recipient: ShareRecipient, outcome: ShareDeliveryOutcome) {
            outcomes[recipient.id] = outcome
            onOutcome(recipient, outcome)
        }
        val destinations = dispatcher.destinationsOf(recipients, request.sender)
        val open = LinkedHashMap<String, MutableList<ShareRecipient>>()
        val admissions = HashMap<String, OutOfThreadAdmission>()
        recipients.forEach { recipient ->
            when (val destination = destinations.getValue(recipient.id)) {
                is ShareDestination.Refused -> report(recipient, ShareDeliveryOutcome.Failed(destination.failure))
                is ShareDestination.Open -> {
                    open.getOrPut(destination.conversationId) { mutableListOf() } += recipient
                    admissions[destination.conversationId] = destination.admission
                }
            }
        }
        if (open.isEmpty()) return outcomes
        val share = try {
            writeSheet(request, open.keys.toList())
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: IOException) {
            store.discard(request.shareId)
            open.values.flatten().forEach { report(it, ShareDeliveryOutcome.Failed(ShareFailure.GENERIC)) }
            return outcomes
        }
        val remaining = serve(share, request.sender, request.previews, admissions) { target, outcome ->
            val conversationId = target.conversationId
            val delivery = when (outcome) {
                is ShareServeOutcome.Served ->
                    if (outcome.queued) ShareDeliveryOutcome.Queued(conversationId) else ShareDeliveryOutcome.Sent(conversationId)
                ShareServeOutcome.Deferred -> ShareDeliveryOutcome.Queued(conversationId)
                is ShareServeOutcome.Refused -> ShareDeliveryOutcome.Failed(outcome.failure)
            }
            open[conversationId].orEmpty().forEach { report(it, delivery) }
        }
        if (!remaining.isFullyServed) scheduler.schedule()
        return outcomes
    }

    /**
     * Reprend les fiches de [user] : sert les cibles restantes. Rend vrai tant qu'une cible reste à servir (le travail
     * réessaie avec recul). Une fiche expirée a déjà été balayée par le magasin avec ses copies.
     */
    public suspend fun resume(user: MeeshyUser): Boolean {
        var pending = false
        store.pending(user.id).forEach { share ->
            val admissions = admissionsOf(share.remainingTargets.map { it.conversationId })
            val after = serve(share, user, PendingMediaPreviewing.None, admissions) { _, _ -> }
            if (!after.isFullyServed) pending = true
        }
        return pending
    }

    private suspend fun admissionsOf(conversationIds: List<String>): Map<String, OutOfThreadAdmission> = try {
        gate.admitAll(conversationIds)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (e: Exception) {
        emptyMap()
    }

    private suspend fun writeSheet(request: ShareDurableRequest, conversationIds: List<String>): SharePendingShare {
        val staged = request.files.mapIndexed { index, item -> stage(request.shareId, index, item) }
        var rank = 0
        val sheet = SharePendingShare.make(
            shareId = request.shareId,
            createdAt = System.currentTimeMillis(),
            ownerUserId = request.sender.id,
            content = request.content?.takeIf { it.isNotBlank() },
            media = staged,
            conversationIds = conversationIds,
            newClientMessageId = { ShareDispatcher.clientIdOf(request.shareId, conversationIds[rank++], 0) },
        )
        store.commit(sheet)
        return sheet
    }

    private suspend fun stage(shareId: String, index: Int, item: MediaUploadItem): ShareStagedMedia = withContext(Dispatchers.IO) {
        val relPath = "${index}_${item.fileName.replace(UNSAFE, "_")}"
        val target = File(store.mediaDirectory(shareId), relPath)
        target.parentFile?.mkdirs()
        item.source.open(0L).use { input -> target.outputStream().use { input.copyTo(it) } }
        ShareStagedMedia(relPath, item.fileName.substringAfterLast('.', ""), item.mimeType, target.length(), item.fileName)
    }

    private suspend fun serve(
        initial: SharePendingShare,
        sender: MeeshyUser,
        previews: PendingMediaPreviewing,
        admissions: Map<String, OutOfThreadAdmission>,
        report: suspend (SharePendingTarget, ShareServeOutcome) -> Unit,
    ): SharePendingShare {
        var share = initial
        var originPending = false
        for (conversationId in ShareSendPacing.serveOrder(initial).map { initial.targets[it].conversationId }) {
            val target = share.targets.firstOrNull { it.conversationId == conversationId } ?: continue
            val isOrigin = share.originTargetIndex?.let { share.targets.getOrNull(it)?.conversationId } == conversationId
            val outcome = if (originPending && !isOrigin) ShareServeOutcome.Deferred else serveOne(share, target, sender, previews, admissions[conversationId])
            if (isOrigin && outcome !is ShareServeOutcome.Served) originPending = outcome is ShareServeOutcome.Deferred
            val next = when (outcome) {
                is ShareServeOutcome.Served -> share.markSent(conversationId, null)
                is ShareServeOutcome.Refused -> share.withoutTarget(conversationId)
                ShareServeOutcome.Deferred -> share
            }
            if (next !== share) {
                share = next
                commit(share)
            }
            report(target, outcome)
        }
        return share
    }

    private suspend fun commit(share: SharePendingShare) {
        try {
            store.commit(share)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: IOException) {
            // La fiche garde son état précédent : la cible sera rejouée, son clientMessageId dédoublonne.
        }
    }

    private suspend fun serveOne(
        share: SharePendingShare,
        target: SharePendingTarget,
        sender: MeeshyUser,
        previews: PendingMediaPreviewing,
        admission: OutOfThreadAdmission?,
    ): ShareServeOutcome = try {
        when (admission) {
            null, OutOfThreadAdmission.UNREACHABLE -> ShareServeOutcome.Deferred
            OutOfThreadAdmission.END_TO_END -> ShareServeOutcome.Refused(ShareFailure.SEALED_DESTINATION)
            OutOfThreadAdmission.SEND, OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN -> {
                val refused = post(share, target, sender, previews)
                refused ?: ShareServeOutcome.Served(queued = !network.isOnline.value || admission == OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN)
            }
        }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (refusal: ShareServeException) {
        when (val verdict = ShareSendPacing.verdict(refusal.status, refusal.moment)) {
            ShareVerdict.Transient -> ShareServeOutcome.Deferred
            is ShareVerdict.Refused -> ShareServeOutcome.Refused(ShareFailure.GENERIC, verdict.reason)
        }
    } catch (e: Exception) {
        ShareServeOutcome.Deferred
    }

    /** Poste le message de [target] ; rend un refus définitif ou `null` quand le message est entré dans la file durable. */
    private suspend fun post(
        share: SharePendingShare,
        target: SharePendingTarget,
        sender: MeeshyUser,
        previews: PendingMediaPreviewing,
    ): ShareServeOutcome.Refused? {
        val content = share.content.orEmpty()
        if (share.media.isEmpty()) {
            forwards.post(plain(content), target.conversationId, sender, target.clientMessageId)
            return null
        }
        val origin = share.targets.getOrNull(share.originTargetIndex ?: 0) ?: return ShareServeOutcome.Refused(ShareFailure.NOTHING_TO_SEND)
        val language = sender.systemLanguage?.takeIf { it.isNotBlank() } ?: LanguageResolver.FALLBACK_LANGUAGE
        val type = messageTypeOf(share)
        if (origin.clientMessageId != target.clientMessageId) {
            messages.sendOptimistic(
                conversationId = target.conversationId,
                content = content,
                originalLanguage = language,
                sender = sender,
                messageType = type,
                clientMessageId = target.clientMessageId,
                copyAttachmentsFromMessageId = origin.clientMessageId,
            )
            return null
        }
        val items = itemsOf(share) ?: return ShareServeOutcome.Refused(ShareFailure.NOTHING_TO_SEND)
        val cmids = items.mapIndexed { index, item ->
            OutboxIds.derivedCmid("share-upload|${target.clientMessageId}|$index").also { cmid ->
                uploads.enqueueAs(cmid, item, conversationId = target.conversationId)
            }
        }
        val attachments = items.mapIndexed { index, item ->
            val preview = previews.render(cmids[index], item, MessageEffects())
            ApiMessageAttachment(
                id = cmids[index],
                fileName = item.fileName,
                originalName = item.fileName,
                mimeType = item.mimeType,
                fileSize = item.sizeBytes.toInt(),
                thumbnailUrl = preview?.thumbnailUrl,
                width = preview?.width,
                height = preview?.height,
                duration = (preview?.durationMs ?: item.durationMs)?.toInt(),
            )
        }
        messages.sendOptimistic(
            conversationId = target.conversationId,
            content = content,
            originalLanguage = language,
            sender = sender,
            messageType = type,
            attachmentUploadCmids = cmids,
            attachments = attachments,
            clientMessageId = target.clientMessageId,
        )
        return null
    }

    private fun itemsOf(share: SharePendingShare): List<MediaUploadItem>? {
        val directory = store.mediaDirectory(share.clientMessageId)
        val files = share.media.map { it to File(directory, it.relPath) }
        if (files.any { (_, file) -> !file.isFile }) return null
        return files.map { (media, file) -> MediaUploadItem.onDisk(file, media.originalName ?: file.name, media.mime) }
    }

    private fun messageTypeOf(share: SharePendingShare): String {
        val types = share.media.map { AttachmentMessageType.forMime(it.mime) }.distinct()
        return types.singleOrNull() ?: AttachmentMessageType.FILE
    }

    private fun plain(content: String) = OutgoingShare(
        content = content,
        originalLanguage = null,
        forwardedFromId = null,
        forwardedFromConversationId = null,
        effectFlags = 0L,
        ephemeralDuration = null,
    )

    private companion object {
        private val UNSAFE = Regex("[^A-Za-z0-9._-]")
    }
}
