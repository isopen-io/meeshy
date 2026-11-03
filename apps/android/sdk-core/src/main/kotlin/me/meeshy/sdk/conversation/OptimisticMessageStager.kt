package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.model.ApiMessage

/**
 * Pose et retire la bulle OPTIMISTE d'un envoi — texte, média (chemins locaux `content://` / `file://`, protection
 * et réponse déjà résolue portées par l'[ApiMessage] reçu), sticker — et l'aperçu de liste qui l'accompagne.
 * Miroir d'`OptimisticMessageStager` (iOS). La ligne naît dans Room (le fil l'observe) AVANT tout accusé ;
 * l'aperçu est un confort : sa panne ne casse jamais un envoi.
 *
 * Défaire est CIBLÉ ([withdraw]) : on retire la bulle posée et rien d'autre.
 */
internal class OptimisticMessageStager(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val previews: SendPreviewSink? = null,
) {

    suspend fun stage(bubble: ApiMessage, nowMillis: Long) {
        database.withTransaction {
            messageDao.upsertAll(listOf(MessageEntityFactory.local(bubble, nowMillis, LocalSendState.SENDING)))
        }
        preview { it.staged(bubble) }
    }

    /** Retire la bulle [cid] et recalcule l'aperçu de sa conversation. Sans effet si elle est déjà partie. */
    suspend fun withdraw(cid: String) {
        val conversationId = messageDao.find(cid)?.conversationId
        withContext(NonCancellable) {
            messageDao.deleteByIds(listOf(cid))
            if (conversationId != null) preview { it.rolledBack(conversationId, cid) }
        }
    }

    /** L'enfilage a échoué : la bulle reste, en échec, avec la raison — renvoyable, jamais disparue en silence. */
    suspend fun failEnqueue(cid: String, cause: Throwable) {
        val reason = cause.message?.takeIf { it.isNotBlank() } ?: cause.javaClass.simpleName
        val retryCount = messageDao.find(cid)?.retryCount ?: 0
        messageDao.recordSendAttempt(cid, LocalSendState.FAILED.name, retryCount, reason)
    }

    private suspend fun preview(block: suspend (SendPreviewSink) -> Unit) {
        val sink = previews ?: return
        try {
            block(sink)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // L'aperçu se corrige à la prochaine synchro ; l'envoi, lui, ne dépend pas de lui.
        }
    }
}
