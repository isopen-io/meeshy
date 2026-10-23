package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.FriendshipStatus
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FriendshipCacheHydrationTest {

    private fun req(id: String, sender: String = "", receiver: String = "", status: String = "pending") =
        FriendRequest(id = id, senderId = sender, receiverId = receiver, status = status)

    private fun persisted(seed: FriendshipSeed?) = object : PersistedFriendCaches {
        var invalidations = 0
        override suspend fun invalidate() { invalidations++ }
        override suspend fun seed(): FriendshipSeed? = seed
    }

    @Test
    fun `two simultaneous triggers share one fetch`() = runTest {
        val cache = FriendshipCache()
        val gate = CompletableDeferred<Unit>()
        var fetches = 0
        val fetch: suspend () -> FriendshipPages? = {
            fetches++
            gate.await()
            FriendshipPages(sent = listOf(req("r1", receiver = "u1", status = "accepted")), received = emptyList())
        }

        launch { cache.hydrateCoalesced(fetch = fetch) }
        launch { cache.hydrateCoalesced(fetch = fetch) }
        advanceUntilIdle()
        gate.complete(Unit)
        advanceUntilIdle()

        assertThat(fetches).isEqualTo(1)
        assertThat(cache.isFriend("u1")).isTrue()
        assertThat(cache.isHydrated).isTrue()
    }

    @Test
    fun `a hydrated cache does not fetch again`() = runTest {
        val cache = FriendshipCache()
        cache.hydrate(sent = emptyList(), received = emptyList())
        var fetches = 0

        cache.hydrateCoalesced(fetch = { fetches++; null })

        assertThat(fetches).isEqualTo(0)
    }

    @Test
    fun `a clear during the fetch discards the stale result`() = runTest {
        val cache = FriendshipCache()
        val gate = CompletableDeferred<Unit>()
        launch {
            cache.hydrateCoalesced(fetch = {
                gate.await()
                FriendshipPages(sent = listOf(req("r1", receiver = "old", status = "accepted")), received = emptyList())
            })
        }
        advanceUntilIdle()

        cache.clear()
        gate.complete(Unit)
        advanceUntilIdle()

        assertThat(cache.isFriend("old")).isFalse()
        assertThat(cache.isHydrated).isFalse()
    }

    @Test
    fun `an authoritative hydrate during the fetch wins over the late response`() = runTest {
        val cache = FriendshipCache()
        val gate = CompletableDeferred<Unit>()
        launch {
            cache.hydrateCoalesced(fetch = {
                gate.await()
                FriendshipPages(sent = emptyList(), received = emptyList())
            })
        }
        advanceUntilIdle()

        cache.hydrate(sent = listOf(req("r2", receiver = "fresh", status = "accepted")), received = emptyList())
        gate.complete(Unit)
        advanceUntilIdle()

        assertThat(cache.isFriend("fresh")).isTrue()
    }

    @Test
    fun `persisted rosters seed the graph before the network answers`() = runTest {
        val seed = FriendshipSeed(
            friends = listOf(FriendRequestUser(id = "f1")),
            received = listOf(req("r3", sender = "s1")),
            sent = listOf(req("r4", receiver = "t1")),
        )
        val cache = FriendshipCache(persisted(seed))
        val gate = CompletableDeferred<Unit>()
        launch { cache.hydrateCoalesced(fetch = { gate.await(); null }) }
        advanceUntilIdle()

        assertThat(cache.status("f1")).isEqualTo(FriendshipStatus.Friend)
        assertThat(cache.status("s1")).isEqualTo(FriendshipStatus.PendingReceived("r3"))
        assertThat(cache.status("t1")).isEqualTo(FriendshipStatus.PendingSent("r4"))
        assertThat(cache.isHydrated).isFalse()
        gate.complete(Unit)
        advanceUntilIdle()
    }

    @Test
    fun `a failed fetch keeps the seeded graph and stays not hydrated`() = runTest {
        val seed = FriendshipSeed(listOf(FriendRequestUser(id = "f1")), emptyList(), emptyList())
        val cache = FriendshipCache(persisted(seed))

        cache.hydrateCoalesced(fetch = { null })

        assertThat(cache.isFriend("f1")).isTrue()
        assertThat(cache.isHydrated).isFalse()
    }

    @Test
    fun `the network response replaces the seed`() = runTest {
        val seed = FriendshipSeed(listOf(FriendRequestUser(id = "gone")), emptyList(), emptyList())
        val cache = FriendshipCache(persisted(seed))

        cache.hydrateCoalesced(fetch = {
            FriendshipPages(sent = listOf(req("r5", receiver = "kept", status = "accepted")), received = emptyList())
        })

        assertThat(cache.isFriend("gone")).isFalse()
        assertThat(cache.isFriend("kept")).isTrue()
    }

    @Test
    fun `invalidatePersistedFriendCaches delegates to the persisted rosters`() = runTest {
        val store = persisted(null)
        FriendshipCache(store).invalidatePersistedFriendCaches()
        assertThat(store.invalidations).isEqualTo(1)
    }

    @Test
    fun `presence is never derived from the friend graph`() = runTest {
        val cache = FriendshipCache()
        cache.hydrate(sent = listOf(req("r6", receiver = "u9", status = "accepted")), received = emptyList())
        assertThat(cache.status("u9")).isEqualTo(FriendshipStatus.Friend)
    }
}
