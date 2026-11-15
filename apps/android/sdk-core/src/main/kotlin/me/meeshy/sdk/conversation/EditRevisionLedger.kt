package me.meeshy.sdk.conversation

import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import me.meeshy.core.database.dao.EditRevisionDao
import me.meeshy.core.database.entity.EditRevisionEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.EditHistoryProjection
import me.meeshy.sdk.model.EditRevision
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite

/**
 * Les versions antérieures des messages que CET appareil a modifiés (le serveur n'expose pas
 * l'historique — comme `EditHistoryStore` sur iOS) : enregistrées au moment de l'édition
 * optimiste, relues en flux par la fiche « Historique ». Bornées comme iOS (30 versions par
 * message, 200 messages suivis) et effacées avec le message : une suppression qui vide le
 * contenu ne laisse pas ses anciennes versions derrière elle.
 */
class EditRevisionLedger @Inject constructor(
    private val dao: EditRevisionDao,
    private val clock: CacheClock,
    private val fence: AccountFence? = null,
) {
    /** Le compte auquel appartient le geste d'édition qui part MAINTENANT (#13560) ; `null` sans garde. */
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    suspend fun record(messageId: String, previousContent: String?, newContent: String, ticket: AccountTicket?) {
        if (!EditHistoryProjection.shouldRecord(previousContent, newContent)) return
        fence.commitOrWrite(ticket) {
            val next = (dao.forMessage(messageId).maxOfOrNull { it.revision } ?: 0) + 1
            dao.upsert(EditRevisionEntity(messageId, next, previousContent.orEmpty(), clock.nowMillis()))
            dao.deleteUpTo(messageId, next - MAX_REVISIONS_PER_MESSAGE)
            dao.keepMostRecentMessages(MAX_TRACKED_MESSAGES)
        }
    }

    suspend fun forget(messageIds: Collection<String>) {
        messageIds.distinct().forEach { dao.deleteForMessage(it) }
    }

    fun observe(messageId: String): Flow<List<EditRevision>> =
        dao.observe(messageId).map { rows -> rows.map { EditRevision(it.revision, it.content, it.editedAt) } }

    companion object {
        const val MAX_REVISIONS_PER_MESSAGE: Int = 30
        const val MAX_TRACKED_MESSAGES: Int = 200
    }
}
