package me.meeshy.sdk.preferences

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.PreferenceCategory
import me.meeshy.sdk.model.PreferenceCategoryCodec

/**
 * Une catégorie vue par [UserPreferencesManager] : sa valeur locale (source de vérité de l'écran), la façon de la lire
 * et de la persister À L'INSTANT, le cliché complet qui part au serveur, et l'éventuel ré-estampillage d'une écriture.
 */
internal class CategorySlot<T : Any>(
    val category: PreferenceCategory,
    val state: StateFlow<T>,
    private val readCurrent: suspend () -> T,
    private val persist: suspend (T) -> Unit,
    private val snapshotOf: (T) -> JsonObject,
    private val resetValue: suspend () -> Unit,
    private val stamp: (T) -> T = { it },
) {
    /** Applique [transform] ; rend `true` quand le bloc a changé (alors persisté, jamais attendu du réseau). */
    suspend fun edit(transform: (T) -> T): Boolean {
        val before = readCurrent()
        val after = stamp(transform(before))
        if (after == before) return false
        persist(after)
        return true
    }

    suspend fun currentSnapshot(): JsonObject = snapshotOf(readCurrent())

    suspend fun reset() = resetValue()
}

/** Une catégorie tenue dans le magasin d'instantanés, sous la clé que lit déjà [PreferencesCategoryRepository]. */
internal fun <T : Any> storeBackedSlot(
    codec: PreferenceCategoryCodec<T>,
    store: PreferenceSnapshotStore,
    clock: CacheClock,
    scope: CoroutineScope,
): CategorySlot<T> {
    val key = CategorySyncRepository.blockKey(codec.category)
    val state = MutableStateFlow(codec.fromStorage(null))
    scope.launch { store.observe(key).collect { state.value = codec.fromStorage(it) } }
    return CategorySlot(
        category = codec.category,
        state = state,
        readCurrent = { codec.fromStorage(store.observe(key).first()) },
        persist = { value ->
            store.save(key, codec.storageValue(value), clock.nowMillis())
            state.value = value
        },
        snapshotOf = codec::snapshot,
        resetValue = { state.value = codec.fromStorage(null) },
    )
}
