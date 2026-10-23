package me.meeshy.sdk.call

import me.meeshy.sdk.model.call.CallRecord

/** One memory-cached answer of a non-default journal query. */
internal data class CallJournalMemoryEntry(
    val records: List<CallRecord>,
    val storedAtMillis: Long,
)

/**
 * Bounded LRU of the journal answers to non-default queries (Manqués, a type, a
 * typed name), keyed by [me.meeshy.sdk.model.call.CallJournalQuery.cacheKey]. Room only
 * holds the default journal; a search already made answers again at once from here.
 * Process-lifetime by design: it is a convenience, never a source of truth.
 */
internal class CallJournalMemoryCache(private val maxEntries: Int = DEFAULT_MAX_ENTRIES) {

    private val entries = object : LinkedHashMap<String, CallJournalMemoryEntry>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CallJournalMemoryEntry>?): Boolean =
            size > maxEntries
    }

    @Synchronized
    fun get(key: String): CallJournalMemoryEntry? = entries[key]

    @Synchronized
    fun put(key: String, entry: CallJournalMemoryEntry) {
        entries[key] = entry
    }

    @Synchronized
    fun keys(): List<String> = entries.keys.toList()

    /** Removes the given calls from every cached answer (a line erased for the reader). */
    @Synchronized
    fun removeCalls(callIds: Set<String>) {
        entries.replaceAll { _, entry ->
            entry.copy(records = entry.records.filterNot { it.callId in callIds })
        }
    }

    @Synchronized
    fun clearAll() {
        entries.clear()
    }

    @Synchronized
    fun snapshot(): Map<String, CallJournalMemoryEntry> = LinkedHashMap(entries)

    @Synchronized
    fun restore(snapshot: Map<String, CallJournalMemoryEntry>) {
        entries.clear()
        entries.putAll(snapshot)
    }

    companion object {
        const val DEFAULT_MAX_ENTRIES: Int = 24
    }
}
