package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.MessageWindowMode
import me.meeshy.sdk.model.MessageWindowReducer

/** Ce que l'ouverture du fil SUR un message a trouvé (miroir de `ConversationViewModel+JumpToMessage` iOS). */
internal sealed interface WindowLanding {
    /** La fenêtre entoure désormais le message ; [fromCache] dit qu'aucun réseau n'a été nécessaire. */
    data class Loaded(val mode: MessageWindowMode.Jumped, val fromCache: Boolean) : WindowLanding

    /** Hors ligne et le message n'est pas sur le disque : un état discret, jamais un écran d'erreur. */
    data object NotCached : WindowLanding

    /** Le serveur ne sert pas ce message à ce lecteur (supprimé, masqué, inconnu). */
    data object NotFound : WindowLanding
}

/**
 * Le moteur de fenêtre d'un fil (miroir de `MessageStore` iOS) : le mode observé, le flux Room fenêtré,
 * les ids masqués sans écriture disque et les éphémères échus retirés du flux.
 *
 * [remoteAround] lit `?around=` et fusionne la page dans Room (rend `false` si le serveur ne sert pas le message,
 * lève sur une panne réseau) : la fenêtre se relit ensuite sur le disque, source unique.
 */
internal class MessageWindowSource(
    private val conversationId: String,
    private val messageDao: MessageDao,
    private val remoteAround: suspend (messageId: String) -> Boolean,
    private val nowMillis: () -> Long,
    private val half: Int = HALF_WINDOW,
) {
    private val modeState = MutableStateFlow<MessageWindowMode>(MessageWindowMode.Latest())
    private val concealed = MutableStateFlow<Set<String>>(emptySet())
    private val clockTick = MutableStateFlow(0)
    private val bubbles = HashMap<String, Pair<MessageEntity, LocalMessage>>()

    val mode: StateFlow<MessageWindowMode> get() = modeState

    /** Ids retirés du flux sans toucher au disque : suppression optimiste, éphémère consommé. */
    fun conceal(ids: Collection<String>) = concealed.update { it + ids }

    /** Annule [conceal] (retour arrière d'une suppression optimiste). */
    fun reveal(ids: Collection<String>) = concealed.update { it - ids.toSet() }

    /** Réévalue l'échéance des éphémères : le temps passe sans qu'aucune ligne ne change. */
    fun dropGoneEphemerals() = clockTick.update { it + 1 }

    fun apply(next: MessageWindowMode) {
        modeState.value = next
    }

    fun loadedOlder(pagedCount: Int, oldestPagedMillis: Long?) =
        modeState.update { MessageWindowReducer.loadOlder(it, pagedCount, oldestPagedMillis) }

    fun loadedNewer(newestPagedMillis: Long?, reachedPresent: Boolean) =
        modeState.update { MessageWindowReducer.loadNewer(it, newestPagedMillis, reachedPresent) }

    fun restoreLatest() = modeState.update { MessageWindowReducer.restoreLatest(it) }

    fun enterSearch(ids: List<String>) = modeState.update { MessageWindowReducer.enterSearch(it, ids) }

    /** Le flux du fil, ancien -> récent. Un snapshot identique au précédent n'est pas republié. */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun observe(): Flow<List<LocalMessage>> =
        combine(modeState.flatMapLatest { rows(it) }, concealed, clockTick) { rows, hidden, _ ->
            val now = nowMillis()
            rows.filter { it.id !in hidden && !it.isGone(now) }
        }
            .distinctUntilChanged()
            .map { rows -> rows.map { bubble(it) }.also { bubbles.keys.retainAll(rows.map(MessageEntity::id).toSet()) } }

    /** La conversion en bulle est mémoïsée : une ligne inchangée (même `changeVersion`) garde sa bulle. */
    private fun bubble(row: MessageEntity): LocalMessage {
        val known = bubbles[row.id]
        if (known != null && known.first == row) return known.second
        return row.toLocalMessage().also { bubbles[row.id] = row to it }
    }

    private fun rows(mode: MessageWindowMode): Flow<List<MessageEntity>> {
        val source = when (mode) {
            is MessageWindowMode.Latest -> messageDao.observeRecentForConversation(conversationId, mode.limit)
            is MessageWindowMode.Jumped -> messageDao.observeRangeForConversation(
                conversationId,
                mode.fromMillis,
                mode.throughMillis ?: Long.MAX_VALUE,
            )
            is MessageWindowMode.Search -> messageDao.observeByIds(conversationId, mode.ids)
        }
        return source.map { it.asReversed() }
    }

    /**
     * Ouvre la fenêtre autour de [messageId] : Room d'abord, puis `?around=` quand le disque ne tient pas assez
     * du côté récent. Hors ligne, le disque seul sert ce qu'il a ; sans le message, [WindowLanding.NotCached].
     */
    suspend fun loadWindow(messageId: String): WindowLanding {
        val cached = roomWindow(messageId)
        if (cached != null && cached.complete) return land(cached.mode, fromCache = true)
        val served = try {
            remoteAround(messageId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        return when (served) {
            true -> roomWindow(messageId)?.let { land(it.mode, fromCache = false) } ?: WindowLanding.NotFound
            false -> WindowLanding.NotFound
            null -> cached?.let { land(it.mode, fromCache = true) } ?: WindowLanding.NotCached
        }
    }

    private fun land(mode: MessageWindowMode.Jumped, fromCache: Boolean): WindowLanding {
        modeState.value = mode
        return WindowLanding.Loaded(mode, fromCache)
    }

    private class CachedWindow(val mode: MessageWindowMode.Jumped, val complete: Boolean)

    private suspend fun roomWindow(messageId: String): CachedWindow? {
        val anchor = messageDao.find(messageId)?.takeIf { it.conversationId == conversationId } ?: return null
        val older = messageDao.olderThan(conversationId, anchor.createdAt, half)
        val newer = messageDao.newerThan(conversationId, anchor.createdAt, half)
        val from = older.lastOrNull()?.createdAt ?: anchor.createdAt
        val complete = newer.size >= half
        val through = if (complete) newer.last().createdAt else null
        return CachedWindow(MessageWindowReducer.jump(messageId, from, through), complete)
    }

    companion object {
        const val HALF_WINDOW = 15
    }
}

/** Un message supprimé ou un éphémère échu n'a plus sa place dans le flux (même s'il reste une ligne avant la purge). */
internal fun MessageEntity.isGone(nowMillis: Long): Boolean =
    deletedAt != null || expiresAt?.let { it <= nowMillis } == true
