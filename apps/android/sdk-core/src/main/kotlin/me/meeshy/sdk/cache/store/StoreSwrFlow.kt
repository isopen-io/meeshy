package me.meeshy.sdk.cache.store

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull

/**
 * Lecture cache-first d'une liste du [RoomCacheStore] : le disque est servi tout de suite (Fresh, Stale ou expire),
 * un cache non Fresh revalide en silence, et une panne reseau ne vide jamais ce qui est affiche. Une charge
 * indecodable est un manque de cache (Empty) qui declenche la revalidation. Apres la revalidation, chaque changement
 * du disque est re-emis Fresh. [select] projette la liste stockee vers ce que l'ecran lit ; `null` = rien de lisible.
 */
internal fun <V, T : Any> RoomCacheStore<V>.swrFlow(
    key: String,
    select: (List<V>) -> T?,
    revalidate: suspend () -> Unit,
    onRevalidateError: (Throwable) -> Unit = {},
): Flow<CacheResult<T>> = flow {
    val first = load(key).projected(select)
    emit(first)
    if (first !is CacheResult.Fresh) {
        val revalidated = try {
            revalidate()
            true
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            onRevalidateError(failure)
            false
        }
        if (revalidated) emit(load(key).projected(select))
    }
    emitAll(
        observe(key)
            .map { rows -> rows?.let(select) }
            .distinctUntilChanged()
            .drop(1)
            .map { value -> if (value == null) CacheResult.Empty else CacheResult.Fresh(value, 0L) },
    )
}

private fun <V, T : Any> CacheResult<List<V>>.projected(select: (List<V>) -> T?): CacheResult<T> {
    val picked = valueOrNull?.let(select) ?: return CacheResult.Empty
    return when (this) {
        is CacheResult.Fresh -> CacheResult.Fresh(picked, ageMillis)
        is CacheResult.Stale -> CacheResult.Stale(picked, ageMillis)
        is CacheResult.Syncing -> CacheResult.Syncing(picked)
        CacheResult.Empty -> CacheResult.Empty
    }
}
