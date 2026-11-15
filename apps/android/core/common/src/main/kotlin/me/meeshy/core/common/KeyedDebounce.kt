package me.meeshy.core.common

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

public class KeyedDebounce<K : Any>(private val scope: CoroutineScope) {
    private val lock = Any()
    private val pending = HashMap<K, Pending>()
    private var nextGeneration = 0L

    private class Pending(val generation: Long, val job: Job)

    public fun schedule(key: K, delayMillis: Long, action: suspend () -> Unit) {
        synchronized(lock) {
            pending.remove(key)?.job?.cancel()
            val generation = ++nextGeneration
            val job = scope.launch {
                delay(delayMillis)
                val current = synchronized(lock) {
                    (pending[key]?.generation == generation).also { if (it) pending.remove(key) }
                }
                if (current) action()
            }
            pending[key] = Pending(generation, job)
        }
    }

    public fun cancel(key: K) {
        synchronized(lock) { pending.remove(key)?.job?.cancel() }
    }

    public fun cancelAll() {
        synchronized(lock) {
            pending.values.forEach { it.job.cancel() }
            pending.clear()
        }
    }
}
