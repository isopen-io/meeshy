package me.meeshy.sdk.media

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.media.OutgoingMediaGroup

/**
 * L'écriture d'un groupe de pièces dans l'outbox DURABLE (iOS `AttachmentGroupOutbox`). Chaque pièce devient une ligne
 * `UPLOAD_MEDIA` (octets scellés dans le coffre, jamais un `ByteArray` en base) ; l'envoi de la bulle posée au tap en
 * dépend et reçoit les identifiants serveur à la livraison (greffe du drainer) : un redémarrage au milieu reprend là où la
 * file s'est arrêtée, et la bulle garde son `tempId`, sans doublon.
 *
 * Deux chemins y mènent, qui écrivent le même couple : la coupure réseau AVANT l'upload (écriture d'avance), et l'échec d'un
 * upload EN LIGNE (mêmes reprises à backoff que le texte). Rend `true` si le groupe est en file ; `false` quand c'est
 * impossible (fichier source disparu, disque plein) : état terminal, réessai manuel.
 */
public class OutboxAttachmentGroupSender(
    private val uploads: MediaUploadQueue,
    private val host: AttachmentSendHost,
    private val conversationId: String,
) : AttachmentGroupQueueing {

    override suspend fun enqueueOffline(group: OutgoingMediaGroup, items: List<GroupUploadItem>): Boolean = enqueue(group, items)

    override suspend fun requeueAfterOnlineFailure(group: OutgoingMediaGroup, items: List<GroupUploadItem>): Boolean = enqueue(group, items)

    private suspend fun enqueue(group: OutgoingMediaGroup, items: List<GroupUploadItem>): Boolean {
        if (items.isEmpty()) return false
        val cmids = mutableListOf<String>()
        return try {
            items.forEach { cmids += uploads.enqueue(it.item, conversationId = conversationId, messageCid = group.tempId) }
            host.sendPostedBubble(group.tempId, attachmentIds = cmids, dependsOn = cmids.toSet())
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            cmids.forEach { uploads.cancel(it) }
            false
        }
    }
}
