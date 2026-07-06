package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.net.api.UserSearchResult
import org.junit.Test

class DiscoverSuggestionsTest {

    private fun user(id: String) = UserSearchResult(id = id, username = id)

    @Test
    fun `a cold empty cache is a loading skeleton`() {
        val snapshot = DiscoverSuggestions.snapshot(CacheResult.Empty)

        assertThat(snapshot.users).isEmpty()
        assertThat(snapshot.isLoading).isTrue()
    }

    @Test
    fun `syncing with no data yet is a loading skeleton`() {
        val snapshot = DiscoverSuggestions.snapshot(CacheResult.Syncing(value = null))

        assertThat(snapshot.users).isEmpty()
        assertThat(snapshot.isLoading).isTrue()
    }

    @Test
    fun `syncing over stale data paints it without a spinner`() {
        val users = listOf(user("alice"), user("bob"))

        val snapshot = DiscoverSuggestions.snapshot(CacheResult.Syncing(value = users))

        assertThat(snapshot.users).isEqualTo(users)
        assertThat(snapshot.isLoading).isFalse()
    }

    @Test
    fun `fresh data paints immediately`() {
        val users = listOf(user("carol"))

        val snapshot = DiscoverSuggestions.snapshot(CacheResult.Fresh(value = users, ageMillis = 0L))

        assertThat(snapshot.users).isEqualTo(users)
        assertThat(snapshot.isLoading).isFalse()
    }

    @Test
    fun `stale data paints immediately while it revalidates`() {
        val users = listOf(user("dan"))

        val snapshot = DiscoverSuggestions.snapshot(CacheResult.Stale(value = users, ageMillis = 5_000L))

        assertThat(snapshot.users).isEqualTo(users)
        assertThat(snapshot.isLoading).isFalse()
    }

    @Test
    fun `a revalidated-empty list is content, not a spinner`() {
        val snapshot = DiscoverSuggestions.snapshot(CacheResult.Fresh(value = emptyList(), ageMillis = 0L))

        assertThat(snapshot.users).isEmpty()
        assertThat(snapshot.isLoading).isFalse()
    }
}
