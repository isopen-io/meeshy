package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import org.junit.Test

class StoryTrayReducerTest {

    private fun posts(vararg ids: String): List<ApiPost> = ids.map { ApiPost(id = it, type = "STORY") }

    // --- stories(): which list survives each SWR state ---

    @Test
    fun `fresh carries its own value`() {
        val result = StoryTrayReducer.stories(CacheResult.Fresh(posts("a"), 0), fallback = posts("z"))
        assertThat(result.map { it.id }).containsExactly("a")
    }

    @Test
    fun `stale carries its own value`() {
        val result = StoryTrayReducer.stories(CacheResult.Stale(posts("a"), 0), fallback = posts("z"))
        assertThat(result.map { it.id }).containsExactly("a")
    }

    @Test
    fun `syncing with a value carries that value`() {
        val result = StoryTrayReducer.stories(CacheResult.Syncing(posts("a")), fallback = posts("z"))
        assertThat(result.map { it.id }).containsExactly("a")
    }

    @Test
    fun `syncing without a value keeps the stale fallback on screen`() {
        val result = StoryTrayReducer.stories(CacheResult.Syncing(null), fallback = posts("z"))
        assertThat(result.map { it.id }).containsExactly("z")
    }

    @Test
    fun `empty resolves to nothing`() {
        assertThat(StoryTrayReducer.stories(CacheResult.Empty, fallback = posts("z"))).isEmpty()
    }

    // --- flags(): instant-app skeleton/sync discipline ---

    @Test
    fun `fresh is settled - no sync, no skeleton`() {
        assertThat(StoryTrayReducer.flags(CacheResult.Fresh(posts("a"), 0), hasData = true))
            .isEqualTo(StoryTrayFlags(isSyncing = false, showSkeleton = false))
    }

    @Test
    fun `stale syncs in the background without a skeleton`() {
        assertThat(StoryTrayReducer.flags(CacheResult.Stale(posts("a"), 0), hasData = true))
            .isEqualTo(StoryTrayFlags(isSyncing = true, showSkeleton = false))
    }

    @Test
    fun `syncing with no cached data shows the cold skeleton`() {
        assertThat(StoryTrayReducer.flags(CacheResult.Syncing(null), hasData = false))
            .isEqualTo(StoryTrayFlags(isSyncing = true, showSkeleton = true))
    }

    @Test
    fun `syncing with cached data syncs but keeps the tray painted`() {
        assertThat(StoryTrayReducer.flags(CacheResult.Syncing(null), hasData = true))
            .isEqualTo(StoryTrayFlags(isSyncing = true, showSkeleton = false))
    }

    @Test
    fun `syncing carrying a value never shows the skeleton`() {
        assertThat(StoryTrayReducer.flags(CacheResult.Syncing(posts("a")), hasData = false))
            .isEqualTo(StoryTrayFlags(isSyncing = true, showSkeleton = false))
    }

    @Test
    fun `empty cache shows the cold skeleton`() {
        assertThat(StoryTrayReducer.flags(CacheResult.Empty, hasData = false))
            .isEqualTo(StoryTrayFlags(isSyncing = false, showSkeleton = true))
    }
}
