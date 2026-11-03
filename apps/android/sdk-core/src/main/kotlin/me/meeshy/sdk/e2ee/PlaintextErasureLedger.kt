package me.meeshy.sdk.e2ee

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity.Companion.KIND_CONVERSATION
import me.meeshy.core.database.entity.PlaintextErasureEntity.Companion.KIND_MESSAGE
import me.meeshy.core.database.entity.PlaintextErasureEntity.Companion.SESSION_ACCOUNT
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.conversation.MessageIdReconciliation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.net.MeeshyApi
import kotlinx.coroutines.currentCoroutineContext
import me.meeshy.sdk.session.AccountTicketContext
import me.meeshy.sdk.session.SessionRepository

/**
 * **La file durable des clairs E2EE à retirer du coffre** (#14655, miroir de `MessagePlaintextErasureQueue` et
 * `MessagePlaintextErasures`, iOS #13001). Chaque effacement s'y INSCRIT dans la transaction qui l'écrit dans Room — un
 * événement reçu fil fermé, une page servie, une ligne élaguée, un masquage, une expiration, une conversation supprimée —
 * et [me.meeshy.sdk.e2ee.libsignal.EndToEndPlaintextJanitor] la vide pour le compte de la session. Un coffre verrouillé
 * (#14634) ou une app tuée ne perdent rien : l'inscription attend.
 *
 * Identifiants seuls, jamais de texte. Le `cid_` d'un message n'est retiré que pour SON auteur ([PendingPlaintextErasure]
 * le résout au moment de vider) : un serveur compromis ne fait pas effacer mon texte en le rattachant au message d'un pair.
 *
 * Une suppression lancée ICI n'entre dans la file qu'une fois CONFIRMÉE (réponse du serveur, écho `message:deleted`, page
 * qui la porte) : refusée, elle se rétablit avec son clair (#14656, comme `markDeletedAwaitingConfirmation`, iOS).
 */
@Singleton
public class PlaintextErasureLedger internal constructor(
    private val database: MeeshyDatabase,
    private val clock: CacheClock,
    private val account: () -> String?,
) {
    @Inject
    public constructor(database: MeeshyDatabase, clock: CacheClock, session: SessionRepository) :
        this(database, clock, { session.currentUserId })

    private val dao get() = database.plaintextErasureDao()

    /** Des messages nommés (événement, geste) : chaque ligne connue, par l'une de ses clés, et chaque id inconnu de Room. */
    public suspend fun recordNamed(messageIds: Collection<String>) {
        if (messageIds.isEmpty()) return
        val account = stamp()
        database.withTransaction {
            val rows = messageIds.distinct().mapNotNull { id ->
                val row = MessageIdReconciliation.locate(database, id) ?: return@mapNotNull entry(account, id, null, null)
                if (isEndToEnd(row)) entryOf(account, row) else null
            }
            dao.recordMessages(rows)
        }
    }

    /** Des lignes que Room vient de retirer sans événement (page élaguée) : à appeler dans la transaction du retrait. */
    public suspend fun recordRemovedRows(rows: Collection<MessageEntity>) {
        val account = stamp()
        val entries = rows.filter(::isEndToEnd).map { entryOf(account, it) }
        if (entries.isNotEmpty()) dao.recordMessages(entries)
    }

    /** Les messages qu'une page ou une trame SERVIE dit partis (supprimés, échus, vue unique ouverte par moi). */
    public suspend fun recordServedGone(messages: Collection<ApiMessage>) {
        val now = clock.nowMillis()
        val account = stamp()
        val entries = messages.filter { isEndToEnd(it) && isGoneOnServer(it, now) }
            .map { entry(account, it.id, it.clientMessageId, authorOf(it)) }
        if (entries.isNotEmpty()) dao.recordMessages(entries)
    }

    /** Une conversation supprimée : tous ses clairs composés jusqu'ici partent, même ceux que Room n'a jamais tenus. */
    public suspend fun recordConversation(conversationId: String) {
        if (conversationId.isBlank()) return
        dao.recordConversation(PlaintextErasureEntity(stamp(), KIND_CONVERSATION, conversationId, recordedAt = clock.nowMillis()))
    }

    internal fun observePendingCount(): Flow<Int> = dao.observePendingCount()

    internal suspend fun pending(account: String, limit: Int): List<PendingPlaintextErasure> =
        dao.pending(account, limit).map { PendingPlaintextErasure(it) }

    internal suspend fun acknowledge(account: String, erasures: Collection<PendingPlaintextErasure>) {
        if (erasures.isEmpty()) return
        val now = clock.nowMillis()
        database.withTransaction {
            erasures.forEach { dao.acknowledge(it.row.account, it.row.kind, it.row.itemId, it.row.recordedAt, now) }
            dao.forgetAcknowledgedBefore(now - RETENTION_MILLIS)
        }
    }

    /**
     * L'enveloppe d'un message déjà effacé s'ouvre APRÈS son effacement (appareil hors ligne, enveloppe en file) : son
     * clair doit repartir aussitôt (iOS `EndToEndPlaintextJanitor.reconsider`).
     */
    internal suspend fun wasErased(account: String, messageId: String, conversationId: String, composedAt: Long): Boolean =
        dao.recorded(account, KIND_MESSAGE, listOf(messageId)).isNotEmpty() ||
            dao.recorded(account, KIND_CONVERSATION, listOf(conversationId)).any { composedAt <= it.recordedAt }

    private fun entryOf(account: String, row: MessageEntity): PlaintextErasureEntity {
        val message = runCatching { MeeshyApi.json.decodeFromString(ApiMessage.serializer(), row.payload) }.getOrNull()
        return entry(account, row.serverId ?: row.id, message?.clientMessageId ?: row.id.takeIf { it != row.serverId }, message?.let(::authorOf) ?: row.senderId)
    }

    private fun entry(account: String, id: String, clientMessageId: String?, senderId: String?) = PlaintextErasureEntity(
        account = account,
        kind = KIND_MESSAGE,
        itemId = id,
        clientMessageId = clientMessageId?.takeIf { it.isNotBlank() && it != id },
        senderId = senderId,
        recordedAt = clock.nowMillis(),
    )

    /**
     * Le compte sous lequel l'effacement est ARRIVÉ (#13576 : une trame de A traitée après la connexion de B porte le
     * ticket de A), sinon celui de la session : jamais celui qui se trouve connecté au moment de l'écriture.
     */
    private suspend fun stamp(): String =
        currentCoroutineContext()[AccountTicketContext]?.ticket?.ownerId?.takeIf { it.isNotBlank() }
            ?: account()?.takeIf { it.isNotBlank() }
            ?: SESSION_ACCOUNT

    private fun authorOf(message: ApiMessage): String? = message.sender?.resolvedUserId ?: message.senderId

    private fun isEndToEnd(row: MessageEntity): Boolean = row.isEncrypted || EndToEndRegime.isEndToEnd(row.encryptionMode)

    private fun isEndToEnd(message: ApiMessage): Boolean = message.isEncrypted == true || EndToEndRegime.isEndToEnd(message.encryptionMode)

    private fun isGoneOnServer(message: ApiMessage, nowMillis: Long): Boolean =
        message.deletedAt != null ||
            isoToEpochMillisOrNull(message.expiresAt)?.let { it <= nowMillis } == true ||
            (message.consumedByMe == true && message.effects.has(MessageEffectFlags.VIEW_ONCE))

    internal companion object {
        /**
         * Combien de temps une inscription vidée reste connue : la rétention des enveloppes de la passerelle (30 jours)
         * plus une semaine de marge d'horloge, comme `MessagePlaintextErasureQueue.retention` (iOS).
         */
        const val RETENTION_MILLIS: Long = 37L * 24 * 60 * 60 * 1000
    }
}

/** Une inscription à vider : les clés d'un message pour le compte qui vide, ou une conversation et sa borne. */
internal class PendingPlaintextErasure(val row: PlaintextErasureEntity) {
    val conversationId: String? get() = row.itemId.takeIf { row.kind == KIND_CONVERSATION }

    /** L'id servi, et le `cid_` seulement si [account] en est l'auteur. */
    fun messageKeys(account: String): List<String> =
        if (row.kind != KIND_MESSAGE) {
            emptyList()
        } else {
            listOfNotNull(row.itemId, row.clientMessageId?.takeIf { row.senderId == account }).distinct()
        }
}
