package me.meeshy.app.stories

import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost

/** SWR-derived tray flags — instant-app discipline made testable (no Composable). */
internal data class StoryTrayFlags(
    val isSyncing: Boolean,
    val showSkeleton: Boolean,
)

/**
 * Pure projection of a [CacheResult] of story posts onto the tray's state.
 *
 * Splitting the decision out of [StoriesViewModel] keeps every SWR branch
 * JVM-testable (TDD-COVERAGE.md): the "keep the stale list / when to show the
 * cold skeleton" rules are product UX, so they live here in `:feature:stories`,
 * not in the SDK cache primitives.
 */
internal object StoryTrayReducer {

    /**
     * The story list carried by [result]. A mid-flight [CacheResult.Syncing]
     * with no value yet keeps [fallback] on screen (stale-while-revalidate); a
     * cold [CacheResult.Empty] resolves to nothing.
     */
    fun stories(
        result: CacheResult<List<ApiPost>>,
        fallback: List<ApiPost>,
    ): List<ApiPost> = when (result) {
        is CacheResult.Fresh -> result.value
        is CacheResult.Stale -> result.value
        is CacheResult.Syncing -> result.value ?: fallback
        CacheResult.Empty -> emptyList()
    }

    /**
     * Instant-app flags: the cold skeleton shows ONLY on an [CacheResult.Empty]
     * cache or a still-dataless [CacheResult.Syncing]. Once any rows are cached
     * ([hasData]) the tray paints them and the skeleton never returns.
     */
    fun flags(
        result: CacheResult<List<ApiPost>>,
        hasData: Boolean,
    ): StoryTrayFlags = when (result) {
        is CacheResult.Fresh -> StoryTrayFlags(isSyncing = false, showSkeleton = false)
        is CacheResult.Stale -> StoryTrayFlags(isSyncing = true, showSkeleton = false)
        is CacheResult.Syncing ->
            StoryTrayFlags(isSyncing = true, showSkeleton = result.value == null && !hasData)
        CacheResult.Empty -> StoryTrayFlags(isSyncing = false, showSkeleton = true)
    }
}
