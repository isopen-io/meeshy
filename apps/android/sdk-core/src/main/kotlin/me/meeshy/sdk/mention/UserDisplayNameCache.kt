package me.meeshy.sdk.mention

import me.meeshy.sdk.model.MentionedUser
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Bounded `username -> display name` directory resolving a `@Display Name` mention, even
 * offline. Port of the iOS `UserDisplayNameCache`.
 *
 * Keys are lower-cased. The table holds at most [capacity] entries: past it the oldest
 * arrivals leave, a quarter of the capacity at a time so the eviction is amortised. A name
 * seen for a handle already known updates the value but not its age. Thread-safe.
 */
@Singleton
class UserDisplayNameCache(private val capacity: Int) {

    @Inject constructor() : this(DEFAULT_CAPACITY)

    private val lock = Any()
    private val table = LinkedHashMap<String, String>()

    fun displayName(username: String): String? = synchronized(lock) { table[username.lowercase()] }

    fun allMappings(): Map<String, String> = synchronized(lock) { LinkedHashMap(table) }

    fun track(username: String, displayName: String) {
        if (!isTrackable(username, displayName)) return
        synchronized(lock) { store(username.lowercase(), displayName) }
    }

    fun trackFromMentionedUsers(users: List<MentionedUser>) {
        val pairs = users.mapNotNull { user ->
            val name = user.displayName
            if (name != null && isTrackable(user.username, name)) user.username.lowercase() to name else null
        }
        if (pairs.isEmpty()) return
        synchronized(lock) { pairs.forEach { (key, name) -> store(key, name) } }
    }

    fun clear() {
        synchronized(lock) { table.clear() }
    }

    private fun isTrackable(username: String, displayName: String): Boolean =
        username.isNotEmpty() && displayName.isNotEmpty() && displayName != username

    private fun store(key: String, name: String) {
        val limit = capacity.coerceAtLeast(1)
        if (table.put(key, name) != null || table.size <= limit) return
        val overflow = table.size - limit + limit / 4
        val iterator = table.keys.iterator()
        var removed = 0
        while (removed < overflow && iterator.hasNext()) {
            iterator.next()
            iterator.remove()
            removed++
        }
    }

    companion object {
        const val DEFAULT_CAPACITY: Int = 2_000
    }
}
