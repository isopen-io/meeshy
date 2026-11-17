package me.meeshy.sdk.conversation

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import me.meeshy.sdk.session.AccountTicket

/**
 * #19115 — ONE revalidation at a time per thread, in its own job.
 *
 * The thread revalidates inside the stream's `transformLatest`, and every Room write — a `message:new` from the socket, a
 * receipt, a translation — makes the stream emit, which cancelled the revalidation and restarted it from zero: all its
 * reads come before its single write, so in an active group it could never land. Now the work runs in a job of its own,
 * keyed by the thread: a caller that arrives while it flies joins it instead of starting another, and a caller cancelled
 * while it waits (the next emission) leaves it running — the next one joins the same flight. Its failure reaches every
 * caller that awaits it; once settled, the next call starts a new flight.
 *
 * The flight keeps the context of the caller that started it (dispatcher, account ticket) minus its job, and is keyed by
 * that ticket too: a caller of another account — both members of the thread — or of a new session never joins a flight
 * whose writes its fence would refuse; it starts its own.
 */
internal class ThreadRevalidations {
    private val flights = ConcurrentHashMap<Key, Deferred<Unit>>()

    data class Key(val conversationId: String, val ticket: AccountTicket?)

    suspend fun join(key: Key, work: suspend () -> Unit) {
        val context = currentCoroutineContext().minusKey(Job)
        val fresh = CoroutineScope(context + SupervisorJob()).async(start = CoroutineStart.LAZY) { work() }
        val flight = flights.putIfAbsent(key, fresh) ?: fresh
        if (flight === fresh) {
            fresh.invokeOnCompletion { flights.remove(key, fresh) }
            fresh.start()
        } else {
            fresh.cancel()
        }
        flight.await()
    }
}

/**
 * #19115 — the freshness the thread's stream judges with ([me.meeshy.sdk.cache.cacheFirstFlow]): the same clock and the
 * same window, so a sync instant the stream already counts as fresh starts no revalidation.
 */
internal class StreamFreshness(private val clock: me.meeshy.sdk.cache.CacheClock, private val freshForMillis: Long) {
    fun isFresh(syncedAt: Long?): Boolean = syncedAt != null && clock.nowMillis() - syncedAt <= freshForMillis
}
