package me.meeshy.sdk.category

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.preferences.PreferenceSnapshotStore
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persisted fold state of the conversation-list category sections (iOS `isExpanded`): a
 * `categoryId -> expanded` map kept in the preference snapshot store, so a folded section
 * stays folded across launches and is wiped with the account.
 */
@Singleton
class CategoryExpansionStore @Inject constructor(
    private val store: PreferenceSnapshotStore,
    private val json: Json,
) {
    private val serializer = MapSerializer(String.serializer(), Boolean.serializer())

    fun observe(): Flow<Map<String, Boolean>> =
        store.observe(KEY).map { raw ->
            raw?.let { runCatching { json.decodeFromString(serializer, it) }.getOrNull() }.orEmpty()
        }

    suspend fun set(categoryId: String, expanded: Boolean) = write(observe().first() + (categoryId to expanded))

    suspend fun remove(categoryId: String) = write(observe().first() - categoryId)

    /** Adopts the gateway's fold state wholesale (a revalidation is the authority). */
    suspend fun replaceAll(states: Map<String, Boolean>) = write(states)

    private suspend fun write(states: Map<String, Boolean>) {
        store.save(KEY, json.encodeToString(serializer, states), SystemCacheClock.nowMillis())
    }

    private companion object {
        const val KEY = "category-expansion"
    }
}
