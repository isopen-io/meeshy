package me.meeshy.sdk.media

import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.isProtected
import me.meeshy.sdk.model.media.AttachmentKind
import me.meeshy.sdk.model.media.LocalFileUrl
import me.meeshy.sdk.model.send.BootSendState
import me.meeshy.sdk.net.MeeshyApi
import timber.log.Timber

/**
 * **Au démarrage, la copie nette d'une photo en attente que le processus n'a pas eu le temps d'écrire se refait** (#16013).
 * La copie assainie s'écrit ~0,7 s après la bulle ([PendingMediaPreviewing.keepSharp]) : un processus tué avant laisse la
 * visionneuse sur l'aperçu de 512 px jusqu'à l'accusé. Chaque pièce d'une bulle encore en attente (envoi en cours ou en
 * échec) qui est une photo ORDINAIRE — ni vue unique, ni floutée, ni muette sur sa protection — non encore servie et sans
 * copie nette la retrouve depuis sa copie scellée ([MediaBlobStore]), une pièce après l'autre : une seule photo est tenue
 * en mémoire à la fois. Une pièce qui échoue ne retient pas les suivantes.
 */
public class PendingSharpRevival internal constructor(
    private val pendingBubbles: suspend () -> List<ApiMessage>,
    private val sealed: suspend (cmid: String) -> MediaUploadItem?,
    private val previews: PendingMediaPreviewing,
) {
    @Inject
    public constructor(messageDao: MessageDao, blobs: MediaBlobStore, previews: PendingMediaPreviewing) : this(
        pendingBubbles = { pendingBubblesOf(messageDao) },
        sealed = { cmid -> blobs.get(cmid) },
        previews = previews,
    )

    public suspend fun revive() {
        for (piece in pendingBubbles().flatMap { it.attachments }.filter(::lacksSharpCopy)) {
            try {
                val item = sealed(piece.id) ?: continue
                previews.restoreSharp(piece.id, item, MessageEffects(flags = piece.effectFlags ?: 0L))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "Pending sharp copy revival failed")
            }
        }
    }

    private fun lacksSharpCopy(piece: ApiMessageAttachment): Boolean =
        AttachmentKind.fromMime(piece.mimeType) == AttachmentKind.IMAGE &&
            !piece.isProtected &&
            piece.fileUrl.let { it.isNullOrBlank() || LocalFileUrl.isLocal(it) } &&
            previews.sharpUrlFor(piece.id) == null

    private companion object {
        suspend fun pendingBubblesOf(messageDao: MessageDao): List<ApiMessage> =
            BootSendState.entries.flatMap { messageDao.idsInSendState(it.name) }.distinct().mapNotNull { id ->
                messageDao.find(id)?.let { row -> runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(row.payload) }.getOrNull() }
            }
    }
}
