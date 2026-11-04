package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.QuotePropagation
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite

/**
 * The read-modify-write of one cached message row, shared by the collaborators that mutate a
 * message in place ([MessageMutationWriter] for the optimistic edits and reaction deltas,
 * [MessageEnrichmentWriter] for translations and transcriptions). Room stays the single
 * source: the row is decoded, transformed and re-encoded inside one transaction.
 */
internal class CachedMessageUpdater(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val fence: AccountFence?,
) {

    /** Le compte auquel appartient l'événement ou le geste qui écrit MAINTENANT (#13560) ; `null` sans garde. */
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    /** The cached message [messageId], or `null` when no row exists. */
    suspend fun find(messageId: String): ApiMessage? {
        val row = MessageIdReconciliation.locate(database, messageId) ?: return null
        return MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
    }

    /**
     * Applies [transform] to the cached message and writes it back. Returns the transformed
     * message, or `null` when the row is unknown or — with [requireSynced] — still an
     * optimistic local row the gateway does not know yet.
     */
    suspend fun update(
        messageId: String,
        requireSynced: Boolean,
        transform: (ApiMessage) -> ApiMessage,
    ): ApiMessage? = update(ticket(), messageId, requireSynced, transform)

    /** [update] sous [ticket], pris AVANT la requête dont la réponse écrit la ligne (#13560) : rien n'atterrit chez B. */
    suspend fun update(
        ticket: AccountTicket?,
        messageId: String,
        requireSynced: Boolean,
        transform: (ApiMessage) -> ApiMessage,
    ): ApiMessage? {
        return fence.commitOrWrite(ticket) {
            database.withTransaction {
                val row = MessageIdReconciliation.locate(database, messageId) ?: return@withTransaction null
                if (requireSynced && row.sendState != null) return@withTransaction null
                val current = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
                val updated = transform(current)
                // A transform that returns its input unchanged (an inert socket update, e.g.
                // a duplicate translation) skips the redundant Room write + re-encode.
                if (updated !== current) {
                    messageDao.upsertAll(listOf(MessageEntityFactory.refreshed(row, updated).bumped()))
                }
                updated
            }
        }
    }

    /**
     * Une écriture qui n'enrichit PAS la charge du message mais ses lignes dédiées (traductions, transcriptions) :
     * [apply] reçoit l'identifiant canonique du message (le serveur dès qu'il est connu) et le message décodé, et rend
     * `true` quand elle a écrit. La ligne du message n'est alors pas réécrite, seul son `changeVersion` monte : les
     * observateurs la relisent et la projection superpose les lignes. Sans ligne du message, rien n'est écrit.
     */
    suspend fun enrich(
        ticket: AccountTicket?,
        messageId: String,
        apply: suspend (canonicalId: String, message: ApiMessage) -> Boolean,
    ) {
        fence.commitOrWrite(ticket) {
            database.withTransaction {
                val row = MessageIdReconciliation.locate(database, messageId) ?: return@withTransaction
                val message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
                if (apply(row.serverId ?: message.id, message)) messageDao.bumpChangeVersion(row.id)
            }
        }
    }

    /** Les identifiants sous lesquels une ligne dédiée de [messageId] peut avoir été rangée : local ET serveur. */
    suspend fun idsOf(messageId: String): List<String> {
        val row = MessageIdReconciliation.locate(database, messageId)
        return listOfNotNull(messageId, row?.id, row?.serverId).distinct()
    }

    /**
     * Réécrit EN UNE ÉCRITURE toutes les lignes que [select] rend (même transaction, un seul `upsertAll`), sous le
     * compte de [ticket]. [transform] rend le MÊME objet pour une ligne qu'elle ne change pas : elle n'est pas
     * réécrite, donc ne réveille aucun observateur. Une charge illisible est laissée telle quelle. Rend les
     * conversations réellement écrites.
     */
    suspend fun rewriteMany(
        ticket: AccountTicket?,
        select: suspend () -> List<MessageEntity>,
        transform: (ApiMessage) -> ApiMessage,
    ): Set<String> = fence.commitOrWrite(ticket) {
        database.withTransaction {
            val written = select().mapNotNull { row ->
                val current = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(row.payload) }.getOrNull()
                    ?: return@mapNotNull null
                val updated = transform(current)
                if (updated === current) null else MessageEntityFactory.refreshed(row, updated).bumped()
            }
            if (written.isNotEmpty()) messageDao.upsertAll(written)
            written.map { it.conversationId }.toSet()
        }
    } ?: emptySet()

    /**
     * Réécrit, dans une seule transaction, chaque réponse de [conversationId] qui cite l'un des [parentIds]
     * (identifiant serveur OU local : une réponse cite l'id serveur, la ligne d'un message envoyé d'ici peut
     * encore porter son `cid_`). [transform] rend l'instance reçue quand la citation ne doit pas changer —
     * rien n'est alors écrit. Chaque ligne réécrite voit son `changeVersion` monter : sa cellule se redessine.
     */
    suspend fun updateCiting(
        ticket: AccountTicket?,
        conversationId: String,
        parentIds: Collection<String>,
        transform: (ApiMessage) -> ApiMessage,
    ) {
        fence.commitOrWrite(ticket) {
            database.withTransaction {
                val candidates = parentIds.distinct()
                    .flatMap { messageDao.mentioning(conversationId, it) }
                    .distinctBy { it.id }
                val rewritten = candidates.mapNotNull { row ->
                    val current = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(row.payload) }.getOrNull()
                        ?: return@mapNotNull null
                    if (!QuotePropagation.quotes(current, parentIds)) return@mapNotNull null
                    val updated = transform(current)
                    if (updated === current) null else MessageEntityFactory.refreshed(row, updated).bumped()
                }
                if (rewritten.isNotEmpty()) messageDao.upsertAll(rewritten)
            }
        }
    }

    /** Retire les lignes nommées (par l'une ou l'autre de leurs deux clés) et leurs versions antérieures. */
    suspend fun purge(ticket: AccountTicket?, messageIds: Collection<String>) {
        if (messageIds.isEmpty()) return
        fence.commitOrWrite(ticket) {
            database.withTransaction {
                val rowIds = messageIds.mapNotNull { MessageIdReconciliation.locate(database, it)?.id }.distinct()
                if (rowIds.isNotEmpty()) messageDao.deleteByIds(rowIds)
                messageIds.forEach { database.editRevisionDao().deleteForMessage(it) }
            }
        }
    }
}
