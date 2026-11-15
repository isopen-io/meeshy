package me.meeshy.sdk.cache.store

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import timber.log.Timber

/** Ordre de vidage : le plus critique d'abord (iOS `CacheBackgroundFlushTask`). */
enum class CacheCriticality { CRITICAL, NORMAL, LOW }

/**
 * Le dirty-set : une ecriture qui n'a pas atteint le disque s'y inscrit avec de quoi la rejouer. Il se vide apres
 * [debounceMillis] de calme, et d'un coup par [flushAll] quand l'app passe en arriere-plan (elle risque d'y etre tuee),
 * borne par une echeance, les plus critiques d'abord. Un rejeu qui echoue reste inscrit.
 */
class DirtyFlusher(
    private val scope: CoroutineScope,
    private val debounceMillis: Long = DEFAULT_DEBOUNCE_MILLIS,
) {
    private class Pending(val criticality: CacheCriticality, val flush: suspend () -> Unit)

    private val lock = Mutex()
    private val pending = LinkedHashMap<String, Pending>()
    private var debounce: Job? = null

    suspend fun markDirty(id: String, criticality: CacheCriticality = CacheCriticality.NORMAL, flush: suspend () -> Unit) {
        lock.withLock {
            pending.remove(id)
            pending[id] = Pending(criticality, flush)
        }
        scheduleDebounced()
    }

    suspend fun markClean(id: String) {
        lock.withLock { pending.remove(id) }
    }

    suspend fun pendingIds(): List<String> = lock.withLock { pending.keys.toList() }

    /** Rejoue tout ce qui est en attente, par criticite, sans depasser [deadlineMillis]. Rend le nombre de rejeux reussis. */
    suspend fun flushAll(deadlineMillis: Long): Int {
        debounce?.cancel()
        return withTimeoutOrNull(deadlineMillis) { drain() } ?: 0
    }

    private fun scheduleDebounced() {
        debounce?.cancel()
        debounce = scope.launch {
            delay(debounceMillis)
            drain()
        }
    }

    private suspend fun drain(): Int {
        var flushed = 0
        CacheCriticality.values().forEach { level ->
            while (true) {
                val next = lock.withLock { pending.entries.firstOrNull { it.value.criticality == level }?.toPair() } ?: break
                if (runOne(next.first, next.second)) flushed++ else break
            }
        }
        return flushed
    }

    private suspend fun runOne(id: String, entry: Pending): Boolean = try {
        entry.flush()
        lock.withLock { if (pending[id] === entry) pending.remove(id) }
        true
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        Timber.e(failure, "DirtyFlusher : echec du rejeu de %s", id)
        false
    }

    companion object {
        const val DEFAULT_DEBOUNCE_MILLIS = 2_000L
    }
}
