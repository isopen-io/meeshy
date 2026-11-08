package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.time.Instant
import java.time.ZoneOffset
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.EditRevisionDao
import me.meeshy.core.database.dao.EphemeralReceiptDao
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.MessageKeys
import me.meeshy.core.database.dao.PendingIdDao
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.outbox.OutboxRepository

/**
 * La politique de rétention de l'historique local (miroir de `MessagePersistenceActor+Retention` iOS) : le
 * serveur reste la source de vérité, une ligne purgée se recharge par pagination.
 */
public object MessageRetention {
    /** Durée de conservation d'un message : six mois, comme `defaultRetentionMonths` iOS. */
    public const val RETENTION_MONTHS: Long = 6

    /** Plafond de lignes confirmées par conversation, aligné sur `CachePolicy.Messages.maxItemCount`. */
    public const val MAX_PER_CONVERSATION: Int = 600

    /** Seuil `createdAt` (epoch ms) sous lequel un message est périmé à [nowMillis] (mois calendaires, comme iOS). */
    public fun cutoff(nowMillis: Long, months: Long = RETENTION_MONTHS): Long =
        Instant.ofEpochMilli(nowMillis).atZone(ZoneOffset.UTC).minusMonths(months).toInstant().toEpochMilli()
}

/** Bilan d'une passe de rétention, pour le journal. */
public data class RetentionReport(
    val aged: Int = 0,
    val expired: Int = 0,
    val overCap: Int = 0,
    val outbox: Int = 0,
) {
    val total: Int get() = aged + expired + overCap
}

/**
 * Supprime les messages périmés, éphémères échus et excédentaires AVEC leurs lignes filles (ponts
 * `pending_ids`, révisions d'édition, reçus éphémères, traductions, transcriptions et pistes audio retenues —
 * comme `MessageChildRows.delete` iOS), sans jamais toucher une ligne optimiste non envoyée.
 */
@Singleton
public class MessageRetentionPurger @Inject internal constructor(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val pendingIdDao: PendingIdDao,
    private val editRevisionDao: EditRevisionDao,
    private val ephemeralReceiptDao: EphemeralReceiptDao,
    private val outbox: OutboxRepository,
    private val mediaIndex: ConversationMediaHubIndex? = null,
) {

    public suspend fun run(nowMillis: Long = System.currentTimeMillis()): RetentionReport {
        val aged = purge { messageDao.retentionKeysOlderThan(MessageRetention.cutoff(nowMillis), BATCH) }
        val expired = purge { messageDao.retentionKeysExpired(nowMillis, BATCH) }
        val overCap = messageDao.conversationsOverCap(MessageRetention.MAX_PER_CONVERSATION).sumOf { conversationId ->
            purge { messageDao.retentionKeysBeyondNewest(conversationId, MessageRetention.MAX_PER_CONVERSATION) }
        }
        return RetentionReport(aged, expired, overCap, outbox.collectExhausted())
    }

    /** Accès révoqué ou conversation supprimée : tout le fil part, sans orphelin. Rend le nombre de messages retirés. */
    public suspend fun purgeConversation(conversationId: String): Int {
        if (conversationId.isBlank()) return 0
        mediaIndex?.invalidateConversation(conversationId)
        return database.withTransaction {
            val keys = messageDao.retentionKeysForConversation(conversationId)
            deleteWithChildren(keys)
            pendingIdDao.clearConversation(conversationId)
            keys.size
        }
    }

    private suspend fun purge(select: suspend () -> List<MessageKeys>): Int {
        var total = 0
        while (true) {
            val batch = database.withTransaction {
                val keys = select()
                deleteWithChildren(keys)
                keys.size
            }
            if (batch == 0) return total
            total += batch
            if (batch < BATCH) return total
        }
    }

    private suspend fun deleteWithChildren(keys: List<MessageKeys>) {
        if (keys.isEmpty()) return
        val ids = keys.flatMap { listOfNotNull(it.id, it.serverId) }.distinct()
        ids.chunked(CHUNK).forEach { chunk ->
            pendingIdDao.deleteForMessages(chunk)
            editRevisionDao.deleteForMessages(chunk)
            ephemeralReceiptDao.deleteAll(chunk)
        }
        DedicatedTranslationRows.drop(database, ids)
        keys.map { it.id }.chunked(CHUNK).forEach { messageDao.deleteByIds(it) }
    }

    private companion object {
        const val BATCH = 500
        const val CHUNK = 400
    }
}
