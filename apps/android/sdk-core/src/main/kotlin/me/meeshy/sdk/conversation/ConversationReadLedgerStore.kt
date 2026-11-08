package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationReadEntry
import me.meeshy.sdk.model.ConversationReadEvent
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.sync.UnreadLedger
import timber.log.Timber

/**
 * Le registre de lecture persisté : chaque événement qui nomme UNE conversation passe par [UnreadLedger]
 * (la précédence), puis le compteur SU est écrit dans `ConversationEntity.unreadCount` et dans la charge —
 * jamais la projection, pour que la fermeture rende le vrai décompte et que le SUM SQL reste juste.
 */
@Singleton
public class ConversationReadLedgerStore @Inject constructor(
    private val ledger: UnreadLedger,
    private val database: MeeshyDatabase,
    private val conversationDao: ConversationDao,
) {

    /** Applique [event] puis persiste le compteur de la conversation qu'il nomme. Rend l'entrée d'avant. */
    public suspend fun apply(event: ConversationReadEvent): ConversationReadEntry? {
        val previous = ledger.apply(event)
        namedConversation(event)?.let { persist(it) }
        return previous
    }

    /** La fermeture d'une fenêtre : le reste noté (s'il y en a un) est rendu au cache. */
    public suspend fun close(conversationId: String) {
        if (ledger.close(conversationId) != null) persist(conversationId)
    }

    public fun open(conversationId: String) {
        ledger.open(conversationId)
    }

    private suspend fun persist(conversationId: String) {
        val held = ledger.heldCount(conversationId) ?: return
        try {
            database.withTransaction {
                val row = conversationDao.find(conversationId) ?: return@withTransaction
                if (row.unreadCount == held) return@withTransaction
                val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
                conversationDao.upsertAll(
                    listOf(
                        row.copy(
                            payload = MeeshyApi.json.encodeToString(conversation.copy(unreadCount = held)),
                            unreadCount = held,
                        ),
                    ),
                )
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "non-lus non persistés pour une conversation")
        }
    }

    private fun namedConversation(event: ConversationReadEvent): String? = when (event) {
        is ConversationReadEvent.ServerUnread -> event.conversationId
        is ConversationReadEvent.ServerReceipt -> event.conversationId
        is ConversationReadEvent.LocalMarkRead -> event.conversationId
        is ConversationReadEvent.LocalMarkUnread -> event.conversationId
        is ConversationReadEvent.LocalOpen,
        is ConversationReadEvent.LocalOpenSet,
        is ConversationReadEvent.Snapshot,
        is ConversationReadEvent.Forget,
        -> null
    }
}
