package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.friend.BlockedUser
import org.junit.Test

class BlockCacheTest {

    private fun blocked(id: String, username: String = id) = BlockedUser(id = id, username = username)

    @Test
    fun `fresh cache reports nobody blocked`() {
        val cache = BlockCache()
        assertThat(cache.isBlocked("anyone")).isFalse()
        assertThat(cache.blockedCount).isEqualTo(0)
        assertThat(cache.currentBlockedIds).isEmpty()
    }

    @Test
    fun `hydrate marks every listed id as blocked`() {
        val cache = BlockCache()
        cache.hydrate(listOf(blocked("u1"), blocked("u2")))

        assertThat(cache.isBlocked("u1")).isTrue()
        assertThat(cache.isBlocked("u2")).isTrue()
        assertThat(cache.isBlocked("u3")).isFalse()
        assertThat(cache.blockedCount).isEqualTo(2)
    }

    @Test
    fun `hydrate fully replaces prior state so a stale id cannot survive`() {
        val cache = BlockCache()
        cache.hydrate(listOf(blocked("old")))
        cache.hydrate(listOf(blocked("new")))

        assertThat(cache.isBlocked("old")).isFalse()
        assertThat(cache.isBlocked("new")).isTrue()
        assertThat(cache.currentBlockedIds).containsExactly("new")
    }

    @Test
    fun `hydrate skips blank ids`() {
        val cache = BlockCache()
        cache.hydrate(listOf(blocked(""), blocked("u1")))

        assertThat(cache.blockedCount).isEqualTo(1)
        assertThat(cache.currentBlockedIds).containsExactly("u1")
    }

    @Test
    fun `setBlocked true then false toggles a single entry`() {
        val cache = BlockCache()
        cache.setBlocked("u1", blocked = true)
        assertThat(cache.isBlocked("u1")).isTrue()

        cache.setBlocked("u1", blocked = false)
        assertThat(cache.isBlocked("u1")).isFalse()
    }

    @Test
    fun `setBlocked with a blank id is inert and does not bump the version`() {
        val cache = BlockCache()
        val before = cache.version.value

        cache.setBlocked("", blocked = true)

        assertThat(cache.blockedCount).isEqualTo(0)
        assertThat(cache.version.value).isEqualTo(before)
    }

    @Test
    fun `currentBlockedIds is a defensive copy that does not track later mutations`() {
        val cache = BlockCache()
        cache.setBlocked("u1", blocked = true)
        val snapshot = cache.currentBlockedIds

        cache.setBlocked("u2", blocked = true)

        assertThat(snapshot).containsExactly("u1")
    }

    @Test
    fun `every mutation bumps the version`() {
        val cache = BlockCache()
        val start = cache.version.value

        cache.hydrate(listOf(blocked("u1")))
        cache.setBlocked("u2", blocked = true)
        cache.setBlocked("u2", blocked = false)
        cache.clear()

        assertThat(cache.version.value).isEqualTo(start + 4)
    }

    @Test
    fun `clear empties the blocklist`() {
        val cache = BlockCache()
        cache.hydrate(listOf(blocked("u1"), blocked("u2")))

        cache.clear()

        assertThat(cache.blockedCount).isEqualTo(0)
        assertThat(cache.isBlocked("u1")).isFalse()
    }
}
