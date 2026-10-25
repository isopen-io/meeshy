package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.sameStoredContentAs
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageMergePolicy
import me.meeshy.sdk.model.PendingMessageMutations
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.net.MeeshyApi

/**
 * L'unique porte d'écriture d'un message SERVI (REST, socket, notification) dans Room — miroir de
 * `APIMessageUpsert.upsertBatch` (iOS).
 *
 * Pour chaque message : la ligne existante est retrouvée (identifiant serveur, colonne `serverId`,
 * bulle optimiste par `clientMessageId`), fusionnée champ par champ ([MessageMergePolicy], sous la
 * garde de l'outbox [PendingOutboxGuard]), puis écrite SEULEMENT si ce qu'elle stocke change. Un
 * message reçu trois fois (REST, socket, FCM) donne donc une ligne, et la deuxième et la troisième
 * réception ne réveillent aucun observateur Room : le fil ne recompose pas.
 *
 * Les colonnes locales (tentatives d'envoi, dernière erreur, vue unique ouverte) survivent ; une
 * bulle optimiste que le serveur reconnaît est remplacée par sa jumelle serveur dans la même
 * transaction, sans clignotement, et le pont `cid_ → id serveur` est posé.
 */
internal class MessageIngestPipeline(
    private val database: MeeshyDatabase,
    private val outboxGuard: PendingOutboxGuard = PendingOutboxGuard(database.outboxDao()),
) {

    /** Fusionne [messages] dans sa propre transaction ; rend les conversations réellement écrites. */
    suspend fun ingest(messages: List<ApiMessage>, nowMillis: Long): Set<String> {
        if (messages.isEmpty()) return emptySet()
        return database.withTransaction { mergeInTransaction(messages, nowMillis) }
    }

    /**
     * Fusionne [messages] — À APPELER dans la transaction de l'appelant (une page REST et son
     * élagage ne font qu'une écriture). [conversationId] range la page sous la conversation
     * synchronisée ; `null` garde celle de chaque message. Rend les conversations écrites.
     *
     * Lève [PendingOutboxReadException] quand l'outbox est illisible : la transaction est alors
     * abandonnée plutôt que d'écraser une mutation en attente.
     */
    suspend fun mergeInTransaction(
        messages: List<ApiMessage>,
        nowMillis: Long,
        conversationId: String? = null,
    ): Set<String> {
        if (messages.isEmpty()) return emptySet()
        val pending = outboxGuard.load()
        val messageDao = database.messageDao()
        val writes = LinkedHashMap<String, MessageEntity>()
        val replacedLocalIds = mutableSetOf<String>()
        val changed = mutableSetOf<String>()
        for (incoming in latestPerId(messages)) {
            val filedUnder = conversationId ?: incoming.conversationId
            val fresh = MessageEntityFactory.cached(incoming, cachedAt = nowMillis, conversationId = filedUnder)
            val direct = messageDao.find(incoming.id) ?: messageDao.findByServerId(incoming.id)
            val optimistic = incoming.clientMessageId
                ?.takeIf { it != incoming.id }
                ?.let { messageDao.find(it) }
            val base = direct ?: optimistic
            val row = if (base == null) fresh else merged(base, incoming, fresh, pending)
            listOfNotNull(direct, optimistic).filter { it.id != row.id }.forEach { replacedLocalIds += it.id }
            val unchanged = base != null && base.id == row.id && row.sameStoredContentAs(base)
            if (!unchanged) {
                writes[row.id] = row
                changed += filedUnder
            }
            incoming.clientMessageId?.let { localId ->
                MessageIdReconciliation.recordAck(database, localId, incoming.id, filedUnder, nowMillis)
            }
        }
        replacedLocalIds -= writes.keys
        if (replacedLocalIds.isNotEmpty()) messageDao.deleteByIds(replacedLocalIds.toList())
        if (writes.isNotEmpty()) messageDao.upsertAll(writes.values.toList())
        return changed
    }

    /**
     * La ligne [base] après fusion de [incoming] : payload et colonnes dérivées recalculés depuis
     * le message fusionné, colonnes locales gardées. Une bulle optimiste (autre clé primaire)
     * devient la ligne serveur : seul l'état « vue unique ouverte » la suit, ses tentatives d'envoi
     * appartenaient à l'envoi désormais acquitté.
     */
    private fun merged(
        base: MessageEntity,
        incoming: ApiMessage,
        fresh: MessageEntity,
        pending: PendingMessageMutations,
    ): MessageEntity {
        val cached = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(base.payload) }.getOrNull()
            ?: return fresh.copy(changeVersion = base.changeVersion + 1)
        val outcome = MessageMergePolicy.merge(cached, incoming, pending.guardsFor(incoming.id))
        val sameRow = base.id == fresh.id
        val rebuilt = MessageEntityFactory.refreshed(fresh, outcome.message).copy(
            createdAt = isoToEpochMillisOrNull(outcome.message.createdAt) ?: base.createdAt,
            seq = fresh.seq ?: base.seq,
            viewOnceOpenedAt = base.viewOnceOpenedAt ?: fresh.viewOnceOpenedAt,
            changeVersion = base.changeVersion + 1,
        )
        return if (sameRow) {
            rebuilt.copy(retryCount = base.retryCount, lastError = base.lastError, sendState = base.sendState)
        } else {
            rebuilt
        }
    }

    /** Une rafale peut porter deux fois le même message : seul son dernier état compte. */
    private fun latestPerId(messages: List<ApiMessage>): Collection<ApiMessage> {
        val latest = LinkedHashMap<String, ApiMessage>()
        messages.forEach { message ->
            latest.remove(message.id)
            latest[message.id] = message
        }
        return latest.values
    }
}
