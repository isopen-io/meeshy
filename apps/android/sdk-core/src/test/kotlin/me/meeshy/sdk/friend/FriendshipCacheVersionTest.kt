package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FriendshipCacheVersionTest {

    @Test
    fun `every mutation raises the version by one`() {
        val cache = FriendshipCache()
        val start = cache.version.value
        cache.didSendRequest("a", "r1")
        cache.didCancelRequest("a")
        cache.didReceiveRequest("b", "r2")
        cache.didAcceptRequest("b")
        cache.didRemoveFriend("b")
        cache.clear()
        assertThat(cache.version.value).isEqualTo(start + 6)
    }

    @Test
    fun `concurrent mutations never lose a bump`() {
        val cache = FriendshipCache()
        val threads = (1..8).map { t ->
            Thread { repeat(500) { cache.didSendRequest("u$t-$it", "r") } }
        }
        threads.forEach { it.start() }
        threads.forEach { it.join() }
        assertThat(cache.version.value).isEqualTo(4000)
    }
}
