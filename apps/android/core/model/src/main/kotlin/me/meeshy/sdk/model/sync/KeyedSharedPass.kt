package me.meeshy.sdk.model.sync

/**
 * #18927 — one [SharedPass] per key. The list keys its sweeps by the account ticket: a caller of the account that just
 * signed in (or of a new session) never joins the sweep of the one that left — its fence would refuse every write of that
 * sweep, and the caller would get nothing — it starts its own. A lane whose passes have all settled is dropped when another
 * key opens one, so the lanes held stay bounded by the keys still at work.
 */
class KeyedSharedPass<K>(private val work: suspend (K) -> Unit) {
    private val lock = Any()
    private var lanes: Map<K, SharedPass> = emptyMap()

    suspend fun join(key: K) = lane(key).join()

    suspend fun catchUp(key: K) = lane(key).catchUp()

    internal val laneCount: Int get() = synchronized(lock) { lanes.size }

    private fun lane(key: K): SharedPass = synchronized(lock) {
        lanes[key] ?: SharedPass { work(key) }.also { fresh ->
            lanes = lanes.filterValues { !it.isIdle } + (key to fresh)
        }
    }
}
