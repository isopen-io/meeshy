package me.meeshy.sdk.notification

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.chrome.BadgeCountPolicy
import me.meeshy.sdk.model.chrome.UnreadRegistry
import me.meeshy.sdk.session.PerAccountCache
import timber.log.Timber

/** L'etat unique que lisent la cloche, la pastille du chrome, les widgets et le nombre d'icone. */
public data class UnreadBadgeState(
    val total: Int = 0,
    val bell: Int = 0,
    /** Android n'a pas de `setBadgeCount` : ce nombre porte la notification de synthese et le point de lanceur. */
    val iconCount: Int = 0,
    /** Vrai des qu'une source a parle : tant que faux, un puits ne doit rien croire de `total`. */
    val seeded: Boolean = false,
)

/** Un puits du nombre de non-lus (widgets, notification de synthese...), contribue par `Multibinds`. */
public interface UnreadBadgeSink {
    public suspend fun publish(state: UnreadBadgeState)

    /** Deconnexion : effacer tout ce qui a ete rendu pour le compte quitte. */
    public suspend fun reset()
}

/**
 * Le coordinateur unique du total de messages non lus (miroir de `NotificationCoordinator` iOS).
 * Les sources alimentent un [UnreadRegistry] ; un debounce de [DEBOUNCE_MILLIS] publie UN etat vers
 * les puits, jamais deux fois le meme. Un reveil a froid sans instantane autoritaire ne publie pas de zero.
 */
@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
public class UnreadBadgeCoordinator(
    private val cacheSnapshots: Flow<Map<String, Int>>,
    private val serverUpdates: Flow<Pair<String, Int>>,
    private val localReads: Flow<String>,
    private val bell: Flow<Int>,
    private val badgesEnabled: Flow<Boolean>,
    private val openConversation: Flow<String?>,
    private val sinks: Set<UnreadBadgeSink>,
    private val debounceMillis: Long = DEBOUNCE_MILLIS,
) : PerAccountCache {

    private data class Held(val registry: UnreadRegistry = UnreadRegistry(), val seeded: Boolean = false)

    private val held = MutableStateFlow(Held())
    private val _state = MutableStateFlow(UnreadBadgeState())
    public val state: StateFlow<UnreadBadgeState> = _state.asStateFlow()

    public fun start(scope: CoroutineScope) {
        cacheSnapshots.onEach { snapshot ->
            if (snapshot.isNotEmpty()) held.update { Held(it.registry.seedFromCache(snapshot), true) }
        }.safely().launchIn(scope)
        serverUpdates.onEach { (id, count) -> onServerUnread(id, count) }.safely().launchIn(scope)
        localReads.onEach { id -> held.update { Held(it.registry.markReadLocally(id), true) } }.safely().launchIn(scope)
        openConversation.onEach { id -> held.update { it.copy(registry = it.registry.withOpen(id)) } }.safely().launchIn(scope)
        scope.launch { pipeline() }
    }

    /** Point d'entree des pushes (lot de synchro silencieuse) : `unreadCount` / `conversationUnread` du fil. */
    public fun onServerUnread(conversationId: String, count: Int) {
        held.update { Held(it.registry.applyServer(conversationId, count), true) }
    }

    override suspend fun clear() {
        held.value = Held(seeded = true)
        _state.value = UnreadBadgeState(seeded = true)
        sinks.forEach { sink -> runSink { sink.reset() } }
    }

    private suspend fun pipeline() {
        var previous = UnreadBadgeState()
        combine(held, bell, badgesEnabled) { current, bellCount, enabled ->
            val total = if (current.seeded) current.registry.total else previous.total
            UnreadBadgeState(
                total = total,
                bell = bellCount.coerceAtLeast(0),
                iconCount = BadgeCountPolicy.iconCount(total, enabled),
                seeded = current.seeded || previous.seeded,
            ).also { previous = it }
        }
            .distinctUntilChanged()
            .debounce(debounceMillis)
            .distinctUntilChanged()
            .collect { next ->
                _state.value = next
                if (next.seeded) sinks.forEach { sink -> runSink { sink.publish(next) } }
            }
    }

    private suspend fun runSink(block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "puits de non-lus en echec")
        }
    }

    private fun <T> Flow<T>.safely(): Flow<T> = catch { Timber.w(it, "source de non-lus en echec") }

    public companion object {
        public const val DEBOUNCE_MILLIS: Long = 150
    }
}
