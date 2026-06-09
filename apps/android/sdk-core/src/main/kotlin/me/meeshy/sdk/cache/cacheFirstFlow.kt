package me.meeshy.sdk.cache

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.transformLatest

/**
 * Builds a stale-while-revalidate Flow from a [SwrCacheSource] (ARCHITECTURE.md §4).
 *
 * Behaviour per state:
 * - Cold cache (never synced) → emit [CacheResult.Syncing](null) then revalidate.
 * - Age ≤ [CachePolicy.freshForMillis] → emit [CacheResult.Fresh].
 * - Age ≤ [CachePolicy.keepForMillis] → emit [CacheResult.Stale] + background revalidate.
 * - Age > [CachePolicy.keepForMillis] → emit [CacheResult.Syncing](stale data) + revalidate.
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
    combine(
        source.observe(),
        source.lastSyncedAt(),
    ) { data, syncedAt -> data to syncedAt }
        .distinctUntilChanged()
        .transformLatest { (data, syncedAt) ->
            if (data == null) {
                emit(CacheResult.Empty)
                revalidateSafe(source, onRevalidateError)
                return@transformLatest
            }

            val ageMillis = syncedAt
                ?.let { clock.nowMillis() - it }
                ?: Long.MAX_VALUE

            when {
                ageMillis <= policy.freshForMillis ->
                    emit(CacheResult.Fresh(data, ageMillis))

                ageMillis <= policy.keepForMillis -> {
                    emit(CacheResult.Stale(data, ageMillis))
                    revalidateSafe(source, onRevalidateError)
                }

                else -> {
                    emit(CacheResult.Syncing(data))
                    revalidateSafe(source, onRevalidateError)
                }
            }
        }

private suspend fun <T> revalidateSafe(
    source: SwrCacheSource<T>,
    onError: (Throwable) -> Unit,
) {
    try {
        source.revalidate()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        onError(e)
    }
}
