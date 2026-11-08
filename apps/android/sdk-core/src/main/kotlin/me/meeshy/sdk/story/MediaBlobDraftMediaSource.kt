package me.meeshy.sdk.story

import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.outbox.OutboxIds

/**
 * Les médias d'un ancien brouillon encore sur l'appareil : ceux qu'il nomme par leur `cmid` d'envoi durable, dont les
 * octets attendent dans [MediaBlobStore]. Un identifiant serveur n'a rien sur l'appareil.
 */
public class MediaBlobDraftMediaSource(private val blobStore: MediaBlobStore) : LegacyDraftMediaSource {
    override suspend fun copy(mediaId: String, directory: File): File? {
        if (!OutboxIds.isCmid(mediaId)) return null
        val item = blobStore.get(mediaId) ?: return null
        val stem = mediaId.filter { it.isLetterOrDigit() || it == '-' || it == '_' }.ifEmpty { return null }
        val extension = item.fileName.substringAfterLast('.', "").lowercase().filter { it.isLetterOrDigit() }.ifEmpty { "bin" }
        val target = File(directory, "$stem.$extension")
        withContext(Dispatchers.IO) {
            item.source.open().use { input -> target.outputStream().use { output -> input.copyTo(output) } }
        }
        return target
    }
}
