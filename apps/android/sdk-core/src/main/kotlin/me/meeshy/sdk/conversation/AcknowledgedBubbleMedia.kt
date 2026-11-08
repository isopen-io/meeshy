package me.meeshy.sdk.conversation

import me.meeshy.sdk.media.MediaAdoption
import me.meeshy.sdk.media.PendingMediaPreviewing
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.media.LocalFileUrl
import timber.log.Timber

/**
 * **Les fichiers locaux d'un envoi suivent la ligne qui les remplace, quel que soit l'ordre des arrivées** (#16012).
 * Quand une ligne qui portait des pièces `file://` — la bulle optimiste, ou la bulle que l'accusé socket a seulement
 * renommée — est réécrite avec les adresses servies, le fichier jouable rejoint le cache typé ([MediaAdoption]) et les
 * aperçus en attente que la nouvelle ligne ne référence plus sont libérés. Une pièce encore référencée en `file://`
 * n'est pas touchée : sa bulle la lit toujours, et la réécriture suivante la réglera. [origin] nomme, au journal de
 * débogage, le chemin qui a réglé l'envoi (accusé, `message:new`, page servie).
 */
internal class AcknowledgedBubbleMedia(
    private val adoption: MediaAdoption?,
    private val previews: PendingMediaPreviewing?,
    private val origin: String = ORIGIN_ACK,
) {
    suspend fun settle(previous: List<ApiMessageAttachment>, written: List<ApiMessageAttachment>) {
        if (previous.isEmpty()) return
        val adopted = adoption?.adopt(previous, written) ?: 0
        val stillLocal = written.flatMap { listOfNotNull(it.fileUrl, it.thumbnailUrl) }.filter(LocalFileUrl::isLocal).toSet()
        val gone = previous.filter { attachment -> listOfNotNull(attachment.fileUrl, attachment.thumbnailUrl).none { it in stillLocal } }
        if (gone.isNotEmpty()) previews?.release(gone)
        Timber.d("Envoi réglé par %s : %d fichier(s) adopté(s), %d pièce(s) libérée(s)", origin, adopted, gone.size)
    }

    companion object {
        const val ORIGIN_ACK = "accusé"
        const val ORIGIN_MESSAGE_NEW = "message:new"
        const val ORIGIN_PAGE = "page servie"

        /** Une ligne dont la charge ne nomme aucun fichier de l'appareil n'a rien à régler : on évite de la décoder. */
        fun mayHoldLocalFiles(payload: String): Boolean = payload.contains("file:", ignoreCase = true)
    }
}
