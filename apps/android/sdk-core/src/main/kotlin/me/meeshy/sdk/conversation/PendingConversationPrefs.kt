package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.ConversationPrefsPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxState

/**
 * #19425 — les gestes de préférence de conversation encore dus à la passerelle (épingle, sourdine, archive, nom,
 * catégorie…), du plus ancien au plus récent, par conversation. Une ligne servie ne les défait pas : [replayingPending]
 * les rejoue dessus, jusqu'à leur accusé (la ligne de file disparaît) ou leur épuisement (elle ne compte plus).
 * À lire dans la transaction qui écrit les lignes servies.
 */
internal fun interface PendingConversationPrefs {
    suspend fun snapshots(): Map<String, List<ConversationPrefsPayload>>

    companion object {
        val None = PendingConversationPrefs { emptyMap() }
    }
}

internal class OutboxPendingConversationPrefs(private val outboxDao: OutboxDao) : PendingConversationPrefs {
    override suspend fun snapshots(): Map<String, List<ConversationPrefsPayload>> =
        try {
            outboxDao.byKind(OutboxKind.UPDATE_CONVERSATION_PREFS.name)
                .filter { it.state != OutboxState.EXHAUSTED.name }
                .mapNotNull { row ->
                    runCatching { MeeshyApi.json.decodeFromString<ConversationPrefsPayload>(row.payload) }
                        .getOrNull()
                        ?.let { row.targetId to it }
                }
                .groupBy({ it.first }, { it.second })
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            emptyMap()
        }
}

/**
 * Rejoue [queued] (du plus ancien au plus récent) sur les préférences de la ligne servie. Un champ absent de
 * l'instantané (`null`) ne touche rien, comme côté passerelle ; la version servie est gardée.
 */
internal fun ApiConversation.replayingPending(queued: List<ConversationPrefsPayload>): ApiConversation {
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
