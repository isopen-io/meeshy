package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import me.meeshy.sdk.model.conversationlist.ConversationListPagination
import me.meeshy.sdk.model.conversationlist.PaginationState
import me.meeshy.sdk.model.conversationlist.PaginationVerdict
import me.meeshy.sdk.net.api.ConversationApi

/** Ce que l'écran de la liste voit de la pagination : un état, s'il reste des pages, et deux gestes. */
interface ConversationPaginating {
    val state: StateFlow<PaginationState>
    val hasMore: StateFlow<Boolean>
    suspend fun loadMore()
    suspend fun reset()
}

/** Sans pagination (écran détaché, tests) : rien à charger, jamais de pied. */
object NoConversationPagination : ConversationPaginating {
    override val state: StateFlow<PaginationState> = MutableStateFlow<PaginationState>(PaginationState.Idle).asStateFlow()
    override val hasMore: StateFlow<Boolean> = MutableStateFlow(false).asStateFlow()
    override suspend fun loadMore() = Unit
    override suspend fun reset() = Unit
}

/**
 * La pagination par curseur de la liste (miroir de iOS `ConversationListViewModel.loadMore`) : une page de
 * [ConversationListPagination.PAGE_SIZE] après le curseur, rangée dans Room sans jamais élaguer (la synchro
 * delta/ETag reste le mécanisme de réconciliation). Une page sans progrès force l'état épuisé ET le persiste :
 * aucune boucle infinie, y compris après un redémarrage. Hors ligne, la liste locale reste entière : l'échec
 * ne porte que le pied.
 */
@Singleton
class ConversationPager @Inject constructor(
    private val api: ConversationApi,
    private val repository: ConversationRepository,
    private val store: ConversationPaginationStore,
) : ConversationPaginating {
    private val mutableState = MutableStateFlow<PaginationState>(PaginationState.Idle)
    override val state: StateFlow<PaginationState> = mutableState.asStateFlow()

    private val mutableHasMore = MutableStateFlow(true)
    override val hasMore: StateFlow<Boolean> = mutableHasMore.asStateFlow()

    private var nextCursor: String? = null
    private var restored = false
    private val gate = Mutex()

    /** Relit le curseur persisté (une fois) : un redémarrage reprend la pagination là où elle s'était arrêtée. */
    suspend fun restore() {
        if (restored) return
        restored = true
        val saved = store.load() ?: return
        nextCursor = saved.nextCursor
        mutableHasMore.value = saved.hasMore
        mutableState.value = if (saved.hasMore) PaginationState.Idle else PaginationState.Exhausted
    }

    /** Charge la page suivante. Sans effet si une page est déjà en route ou s'il n'en reste pas. */
    override suspend fun loadMore() {
        restore()
        if (!mutableHasMore.value || !gate.tryLock()) return
        try {
            mutableState.value = PaginationState.LoadingMore
            mutableState.value = fetchNext()
        } finally {
            gate.unlock()
        }
    }

    /** Un rafraîchissement ou un changement de compte repart de la tête : curseur oublié, pages de nouveau permises. */
    override suspend fun reset() {
        restored = true
        nextCursor = null
        mutableHasMore.value = true
        mutableState.value = PaginationState.Idle
        store.clear()
    }

    private suspend fun fetchNext(): PaginationState {
        val cursor = ConversationListPagination.cursor(nextCursor, repository.oldestCachedId())
        val response = try {
            api.listBefore(before = cursor, limit = ConversationListPagination.PAGE_SIZE)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return PaginationState.Failed(e.message.orEmpty())
        }
        val rows = response.data
        if (!response.success || rows == null) {
            return PaginationState.Failed(response.error ?: response.message.orEmpty())
        }
        val served = response.cursorPagination
        val verdict = ConversationListPagination.verdict(
            requestCursor = cursor,
            nextCursor = served?.nextCursor ?: response.pagination?.nextCursor,
            newIds = repository.rememberPage(rows),
            serverHasMore = served?.hasMore ?: response.pagination?.hasMore ?: false,
        )
        return when (verdict) {
            is PaginationVerdict.Continue -> {
                settle(verdict.nextCursor, hasMore = true)
                PaginationState.Idle
            }
            is PaginationVerdict.Exhausted -> {
                settle(verdict.nextCursor, hasMore = false)
                PaginationState.Exhausted
            }
        }
    }

    private suspend fun settle(cursor: String?, hasMore: Boolean) {
        nextCursor = cursor
        mutableHasMore.value = hasMore
        store.save(ConversationPaginationSnapshot(cursor, hasMore))
    }
}
