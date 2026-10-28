package me.meeshy.sdk.conversation

import javax.inject.Inject
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.AccountFence

/** Ce que devient le retrait d'une pièce. */
enum class PieceRemoval {
    /** La passerelle a effacé la pièce. */
    REMOVED,

    /** Le message ou la pièce est inconnu de ce cache, ou la bulle n'est pas encore accusée : rien n'a été tenté. */
    UNKNOWN,

    /** La passerelle a refusé ou n'a pas répondu : la pièce est revenue à sa place. */
    FAILED,
}

/**
 * **Retirer UNE pièce d'un message déjà accusé** (miroir de `removeAttachment`, iOS, #9906) : la pièce quitte la ligne
 * du cache tout de suite, puis la passerelle l'efface (`DELETE /attachments/:id`). Sur un refus ou sans réponse, la pièce
 * REVIENT à sa place — le geste inverse, jamais l'écrasement par un instantané : une réaction arrivée entre-temps sur une
 * autre pièce n'est pas perdue. En ligne seulement (comme iOS) : un effacement de fichiers ne se rejoue pas à l'aveugle.
 */
class MessageAttachmentRemover internal constructor(
    private val updater: CachedMessageUpdater,
    private val mediaApi: MediaApi,
) {
    @Inject
    constructor(
        database: MeeshyDatabase,
        messageDao: MessageDao,
        mediaApi: MediaApi,
        fence: AccountFence? = null,
    ) : this(CachedMessageUpdater(database, messageDao, fence), mediaApi)

    suspend fun remove(messageId: String, attachmentId: String): PieceRemoval {
        var removed: Pair<Int, ApiMessageAttachment>? = null
        updater.update(messageId, requireSynced = true) { message ->
            val index = message.attachments.indexOfFirst { it.id == attachmentId }
            if (index < 0) return@update message
            removed = index to message.attachments[index]
            message.copy(attachments = message.attachments.filterNot { it.id == attachmentId })
        } ?: return PieceRemoval.UNKNOWN
        val (index, piece) = removed ?: return PieceRemoval.UNKNOWN
        return when (apiCall { mediaApi.delete(attachmentId) }) {
            is NetworkResult.Success -> PieceRemoval.REMOVED
            is NetworkResult.Failure -> {
                updater.update(messageId, requireSynced = false) { message ->
                    if (message.attachments.any { it.id == attachmentId }) {
                        message
                    } else {
                        message.copy(attachments = message.attachments.toMutableList().also { it.add(index.coerceAtMost(it.size), piece) })
                    }
                }
                PieceRemoval.FAILED
            }
        }
    }
}
