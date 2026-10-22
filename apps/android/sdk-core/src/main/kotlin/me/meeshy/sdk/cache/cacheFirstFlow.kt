package me.meeshy.sdk.cache

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.transformLatest

/**
 * Builds a stale-while-revalidate Flow from a [SwrCacheSource] (ARCHITECTURE.md §4).
 *
 * Each emission classifies the current (data, age) through the [classifyCache] SSOT and
 * revalidates in the background for every non-[CacheResult.Fresh] verdict:
 * - Cold cache (never synced) → [CacheResult.Empty] then revalidate.
 * - Age ≤ [CachePolicy.freshForMillis] → [CacheResult.Fresh] (no revalidation).
 * - Age ≤ [CachePolicy.keepForMillis] → [CacheResult.Stale] + background revalidate.
 * - Age > [CachePolicy.keepForMillis] → [CacheResult.Syncing](stale data) + revalidate.
 *
 * When revalidation completes, [source] emits new data → `transformLatest` cancels the current
 * transform and restarts, naturally yielding a [CacheResult.Fresh] result — no explicit state
 * machine needed.
 */
fun <T> cacheFirstFlow(
    policy: CachePolicy,
    source: SwrCacheSource<T>,
    clock: CacheClock = SystemCacheClock,
    onRevalidateError: (Throwable) -> Unit = {},
): Flow<CacheResult<T>> =
    cacheFirstFlowOf(
        policy = policy,
        snapshots = combine(source.observe(), source.lastSyncedAt()) { data, syncedAt -> data to syncedAt },
        revalidate = source::revalidate,
        clock = clock,
        onRevalidateError = onRevalidateError,
    )

/**
 * The same stale-while-revalidate classification over [snapshots] — (data, last sync instant)
 * pairs read TOGETHER. A source whose data and instant live in one row passes that row here, so
 * a fresh value is never paired with the previous instant (a transient Stale that would refetch).
 */
fun <T> cacheFirstFlowOf(
    policy: CachePolicy,
    snapshots: Flow<Pair<T?, Long?>>,
    revalidate: suspend () -> Unit,
    clock: CacheClock = SystemCacheClock,
    onRevalidateError: (Throwable) -> Unit = {},
): Flow<CacheResult<T>> =
    snapshots
        .distinctUntilChanged()
        .transformLatest { (data, syncedAt) ->
            val ageMillis = syncedAt
                ?.let { clock.nowMillis() - it }
                ?: Long.MAX_VALUE

            val result = classifyCache(data, ageMillis, policy)
            emit(result)
            if (result !is CacheResult.Fresh) revalidateSafe(revalidate, onRevalidateError)
        }

private suspend fun revalidateSafe(
    revalidate: suspend () -> Unit,
    onError: (Throwable) -> Unit,
) {
    try {
        revalidate()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        onError(e)
    }
}
