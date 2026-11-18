package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.ConversationPrefsPayload
import me.meeshy.sdk.outbox.OutboxEntity
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.ReadReceiptPayload

/**
 * Les gestes de conversation encore dus à la passerelle, tels que la file les tient (une ligne disparaît à son accusé,
 * ne compte plus à son épuisement) :
 * - [prefs] (#19425) : les instantanés de préférences (épingle, sourdine, archive, nom, catégorie…), du plus ancien
 *   au plus récent, par conversation ;
 * - [readThrough] (#19424) : par conversation, l'instant SERVEUR du dernier message lu sur cet appareil, tant que
 *   l'accusé de lecture n'est pas confirmé et qu'aucun « marquer non lu » plus récent n'attend en file.
 */
internal data class PendingGestures(
    val prefs: Map<String, List<ConversationPrefsPayload>> = emptyMap(),
    val readThrough: Map<String, Long> = emptyMap(),
) {
    companion object {
        val None = PendingGestures()
    }
}

/** À lire dans la transaction qui écrit les lignes servies. */
internal fun interface PendingConversationGestures {
    suspend fun load(): PendingGestures

    companion object {
        val None = PendingConversationGestures { PendingGestures.None }
    }
}

internal class OutboxPendingConversationGestures(private val outboxDao: OutboxDao) : PendingConversationGestures {
    override suspend fun load(): PendingGestures =
        try {
            PendingGestures(
                prefs = rows(OutboxKind.UPDATE_CONVERSATION_PREFS)
                    .mapNotNull { row -> decode<ConversationPrefsPayload>(row)?.let { row.targetId to it } }
                    .groupBy({ it.first }, { it.second }),
                readThrough = readFrontiers(rows(OutboxKind.READ_RECEIPT), rows(OutboxKind.MARK_UNREAD)),
            )
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            PendingGestures.None
        }

    /**
     * Par conversation, la frontière la plus avancée des reçus encore dus APRÈS le dernier « marquer non lu » en file :
     * un reçu déjà en vol que le geste inverse n'a pas pu annuler ne tient plus le badge à zéro.
     */
    private fun readFrontiers(receipts: List<OutboxEntity>, unreads: List<OutboxEntity>): Map<String, Long> {
        val lastUnread = unreads.groupBy { it.targetId }.mapValues { (_, rows) -> rows.maxOf { it.createdAt } }
        return receipts
            .filter { row -> lastUnread[row.targetId]?.let { row.createdAt > it } ?: true }
            .mapNotNull { row -> decode<ReadReceiptPayload>(row)?.readThroughAt?.let { row.targetId to it } }
            .groupBy({ it.first }, { it.second })
            .mapValues { (_, frontiers) -> frontiers.max() }
    }

    private suspend fun rows(kind: OutboxKind): List<OutboxEntity> =
        outboxDao.byKind(kind.name).filter { it.state != OutboxState.EXHAUSTED.name }

    private inline fun <reified T> decode(row: OutboxEntity): T? =
        runCatching { MeeshyApi.json.decodeFromString<T>(row.payload) }.getOrNull()
}

/** Rejoue sur la ligne servie ce que la file doit encore à la passerelle : préférences, puis frontière de lecture. */
internal fun ApiConversation.replayingPending(gestures: PendingGestures): ApiConversation =
    replayingPrefs(gestures.prefs[id].orEmpty()).keepingReadThrough(gestures.readThrough[id])

/**
 * Rejoue [queued] (du plus ancien au plus récent) sur les préférences de la ligne servie. Un champ absent de
 * l'instantané (`null`) ne touche rien, comme côté passerelle ; la version servie est gardée.
 */
private fun ApiConversation.replayingPrefs(queued: List<ConversationPrefsPayload>): ApiConversation {
    if (queued.isEmpty()) return this
    val base = resolvedPreferences ?: ApiConversationPreferences()
    val next = queued.fold(base) { prefs, snapshot ->
        prefs.copy(
            isPinned = snapshot.isPinned,
            isMuted = snapshot.isMuted,
            isArchived = snapshot.isArchived,
            mentionsOnly = snapshot.mentionsOnly,
            categoryId = if (snapshot.clearCategory) null else snapshot.categoryId ?: prefs.categoryId,
            customName = snapshot.customName ?: prefs.customName,
            reaction = snapshot.reaction ?: prefs.reaction,
            tags = snapshot.tags ?: prefs.tags,
            appearance = snapshot.appearance ?: prefs.appearance,
        )
    }
    return if (next == base) this else copy(preferences = next)
}

/**
 * #19424 — tant que l'accusé n'est pas confirmé, une ligne servie dont le dernier message n'est pas plus récent que
 * [readThrough] (deux instants SERVEUR, jamais l'horloge de l'appareil) garde un non-lu nul. Un dernier message
 * illisible ou plus récent laisse le compteur servi.
 */
private fun ApiConversation.keepingReadThrough(readThrough: Long?): ApiConversation {
    if (readThrough == null || unreadCount == 0) return this
    val lastAt = lastMessage?.createdAt?.let(::isoToEpochMillisOrNull) ?: return this
    return if (lastAt <= readThrough) copy(unreadCount = 0) else this
}
