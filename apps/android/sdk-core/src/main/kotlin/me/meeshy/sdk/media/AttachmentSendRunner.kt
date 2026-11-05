package me.meeshy.sdk.media

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.guest.GuestAttachmentKind
import me.meeshy.sdk.model.media.AttachmentSendBatch
import me.meeshy.sdk.model.media.OutgoingAttachmentRules
import me.meeshy.sdk.model.media.OutgoingMediaGroup
import me.meeshy.sdk.model.media.TusTranscription

/** L'appareil est-il en ligne ? Hors ligne, un groupe va droit à l'outbox durable : jamais le chemin TUS, qui échouerait aussitôt. */
public fun interface AttachmentSendConnectivity {
    public fun isOnline(): Boolean
}

/** Y a-t-il un jeton pour parler à la passerelle ? Sans lui, l'envoi est abandonné et la place restaurée. */
public fun interface AttachmentSendCredential {
    public fun isAvailable(): Boolean
}

/** Ce que l'envoi demande à la conversation : envoyer la bulle posée au tap, ou la marquer en échec avec sa raison. */
public interface AttachmentSendHost {
    /** Met en file l'envoi de la bulle [tempId] (réutilisée, jamais doublée) avec les pièces [attachmentIds]. */
    public suspend fun sendPostedBubble(tempId: String, attachmentIds: List<String> = emptyList(), dependsOn: Set<String> = emptySet()): Boolean

    public suspend fun markFailed(tempId: String, reason: String)
}

/** La mise en file DURABLE d'un groupe : hors ligne (écriture d'avance), ou après un échec en ligne (mêmes reprises à backoff que le texte). */
public interface AttachmentGroupQueueing {
    public suspend fun enqueueOffline(group: OutgoingMediaGroup, items: List<GroupUploadItem>): Boolean

    public suspend fun requeueAfterOnlineFailure(group: OutgoingMediaGroup, items: List<GroupUploadItem>): Boolean
}

/**
 * Les transcriptions locales d'un groupe audio. INERTE par défaut ([None]) : sans moteur sur l'appareil, le fichier part sans
 * texte et la transcription reprend côté serveur. Le moteur les pose sur la bulle et les rekeye sur les ids serveur.
 */
public interface LocalTranscriptions {
    public suspend fun await(attachmentIds: List<String>, tempId: String): Map<String, TusTranscription>

    public fun promoted(localId: String, serverId: String)

    /** Ce qui est DÉJÀ connu, sans attendre : ce que l'envoi emporte quand le budget est épuisé (les vocaux prêts partent avec leur texte). */
    public fun known(attachmentIds: List<String>): Map<String, TusTranscription> = emptyMap()

    public object None : LocalTranscriptions {
        override suspend fun await(attachmentIds: List<String>, tempId: String): Map<String, TusTranscription> = emptyMap()

        override fun promoted(localId: String, serverId: String) = Unit
    }

    public companion object {
        /** Un groupe audio attend AU PLUS ce délai les transcriptions locales : au-delà, il part sans texte. */
        public const val SEND_WAIT_BUDGET_MS: Long = 700L
    }
}

/** Le retour de l'envoi vers l'écran : haptique, toast, place du lieu, barre. */
public interface AttachmentSendFeedback {
    public fun sendSucceeded()

    public fun sendFailed()

    /** Le toast « Échec de l'envoi de la pièce jointe ». */
    public fun showFailureToast()

    /** Le conseil de réduire le nombre de pièces, localisé. */
    public fun reduceHint(attachmentCount: Int): String

    /** Le lieu saisi revient dans le composeur quand l'envoi n'est pas parti. */
    public fun restorePlace(sent: Boolean)

    /** L'envoi est abandonné avant de monter : la barre se retire. */
    public fun abortUpload()
}

/** La suppression des fichiers de travail d'un envoi : les visuels tout de suite, les vocaux après [AttachmentSendBatch.VOICE_RETENTION_MS]. */
public interface AttachmentFileCleanup {
    public fun deleteNow(attachmentIds: List<String>)

    public fun deleteAfter(attachmentIds: List<String>, delayMs: Long)
}

/**
 * L'exécuteur d'un envoi de pièces (iOS `AttachmentSendRunner`) : les groupes média partent dans l'ordre du composeur, puis le
 * texte (ou le lieu) EN DERNIER sur la bulle posée au tap.
 * - HORS LIGNE : écriture durable dans l'outbox, sans TUS ;
 * - EN LIGNE : téléversement parallèle borné, puis envoi du message qui RÉUTILISE le `tempId` de la bulle (aucun doublon) ;
 * - un échec en ligne rejoint l'outbox (reprises à backoff) ; un refus de pièce d'invité est DÉFINITIF et la bulle dit pourquoi ;
 * - sans jeton, l'envoi est abandonné et la place restaurée.
 */
public class AttachmentSendRunner(
    private val host: AttachmentSendHost,
    private val queue: AttachmentGroupQueueing,
    private val uploader: MediaGroupUploading,
    private val connectivity: AttachmentSendConnectivity,
    private val credential: AttachmentSendCredential,
    private val feedback: AttachmentSendFeedback,
    private val cleanup: AttachmentFileCleanup,
    private val transcriptions: LocalTranscriptions = LocalTranscriptions.None,
) {
    /** [files] : les pièces du lot, par identifiant local ; [guestKinds] : les familles ouvertes à l'invité (`null` = aucune restriction). */
    public suspend fun run(batch: AttachmentSendBatch, files: Map<String, GroupUploadItem>, guestKinds: List<GuestAttachmentKind>? = null) {
        if (!credential.isAvailable()) {
            feedback.abortUpload()
            feedback.showFailureToast()
            feedback.restorePlace(false)
            return
        }
        var anySuccess = false
        for (group in batch.mediaGroups) {
            if (sendGroup(group, files, guestKinds)) anySuccess = true
        }
        if (sendTrailing(batch)) anySuccess = true
        finish(batch, anySuccess)
    }

    private suspend fun sendGroup(group: OutgoingMediaGroup, files: Map<String, GroupUploadItem>, guestKinds: List<GuestAttachmentKind>?): Boolean {
        val items = group.group.attachmentIds.mapNotNull(files::get)
        if (items.isEmpty()) return false
        if (!connectivity.isOnline()) return queue.enqueueOffline(group, items)
        return try {
            val withTranscriptions = withTranscriptions(group, items)
            val uploaded = uploader.upload(group, withTranscriptions, transcriptions::promoted)
            host.sendPostedBubble(group.tempId, uploaded.attachmentIds)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (refused: GuestAttachmentRefusedException) {
            host.markFailed(group.tempId, OutgoingAttachmentRules.guestRefusalReason(refused.refusal, guestKinds))
            false
        } catch (failure: Exception) {
            requeueOrFail(group, items, failure)
        }
    }

    private suspend fun requeueOrFail(group: OutgoingMediaGroup, items: List<GroupUploadItem>, failure: Exception): Boolean {
        if (queue.requeueAfterOnlineFailure(group, items)) return true
        host.markFailed(
            group.tempId,
            OutgoingAttachmentRules.uploadFailureReason(failure.message, items.size, feedback::reduceHint),
        )
        return false
    }

    /** Attente bornée par le budget d'ENVOI : au-delà, le fichier part sans texte et la transcription reprend côté serveur. */
    private suspend fun withTranscriptions(group: OutgoingMediaGroup, items: List<GroupUploadItem>): List<GroupUploadItem> {
        if (!group.group.isAudio) return items
        val ids = items.map { it.attachmentId }
        val awaited = withTimeoutOrNull(LocalTranscriptions.SEND_WAIT_BUDGET_MS) {
            transcriptions.await(ids, group.tempId)
        } ?: transcriptions.known(ids)
        if (awaited.isEmpty()) return items
        return items.map { item ->
            val text = awaited[item.attachmentId] ?: return@map item
            GroupUploadItem(item.attachmentId, item.item, item.thumbHash, text, item.capturedInApp)
        }
    }

    /** Le texte part EN DERNIER sur la bulle posée au tap ; sans texte, un lieu part seul. */
    private suspend fun sendTrailing(batch: AttachmentSendBatch): Boolean {
        val tempId = batch.textTempId
        if (!batch.hasTrailing || tempId == null) return false
        val sent = try {
            host.sendPostedBubble(tempId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            false
        }
        feedback.restorePlace(sent)
        return sent
    }

    /** Les vocaux gardent leur fichier un moment : la bulle porte l'URL `file://` jusqu'à l'écho, et la lecture lit le disque. */
    private fun finish(batch: AttachmentSendBatch, anySuccess: Boolean) {
        val ids = batch.cleanupIds()
        cleanup.deleteNow(ids.visual)
        if (ids.audio.isNotEmpty()) cleanup.deleteAfter(ids.audio, AttachmentSendBatch.VOICE_RETENTION_MS)
        if (anySuccess) {
            feedback.sendSucceeded()
            return
        }
        feedback.sendFailed()
        feedback.showFailureToast()
    }
}
