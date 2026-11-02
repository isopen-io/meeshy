package me.meeshy.sdk.mention

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MentionedUser
import org.junit.Test

class UserDisplayNameCacheTest {

    @Test
    fun `lookup is case insensitive`() {
        val cache = UserDisplayNameCache()
        cache.track("Alice", "Alice Wonder")
        assertThat(cache.displayName("ALICE")).isEqualTo("Alice Wonder")
    }

    @Test
    fun `empty or vanity names are ignored`() {
        val cache = UserDisplayNameCache()
        cache.track("bob", "bob")
        cache.track("", "X")
        cache.track("carl", "")
        assertThat(cache.allMappings()).isEmpty()
    }

    @Test
    fun `mentioned users feed the cache`() {
        val cache = UserDisplayNameCache()
        cache.trackFromMentionedUsers(
            listOf(MentionedUser("1", "dan", "Dan D"), MentionedUser("2", "eve", null)),
        )
        assertThat(cache.allMappings()).containsExactly("dan", "Dan D")
    }

    @Test
    fun `the table is bounded and evicts the oldest by quarter`() {
        val cache = UserDisplayNameCache(capacity = 8)
        (1..8).forEach { cache.track("u$it", "Name $it") }
        cache.track("u9", "Name 9")
        assertThat(cache.allMappings().keys).containsExactly("u4", "u5", "u6", "u7", "u8", "u9").inOrder()
    }

    @Test
    fun `the default capacity is 2000`() {
        val cache = UserDisplayNameCache()
        (1..2_001).forEach { cache.track("user$it", "Name $it") }
        assertThat(cache.allMappings().size).isEqualTo(1_500)
    }

    @Test
    fun `concurrent writers stay within the bound`() {
        val cache = UserDisplayNameCache(capacity = 100)
        val threads = (1..6).map { t -> Thread { repeat(400) { cache.track("t$t-$it", "N $t $it") } } }
        threads.forEach { it.start() }
        threads.forEach { it.join() }
        assertThat(cache.allMappings().size).isAtMost(100)
    }
}
