package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import org.junit.Test

/** #13577 — le graphe d'amis que la réponse de A hydrate après la purge n'atteint pas la mémoire de B. */
class FriendshipCacheAccountRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val cache = FriendshipCache(PersistedFriendCaches.None, fence)
    private val acceptedBySomeoneOfA = FriendRequest(id = "r1", senderId = "me", receiverId = "ami-de-A", status = "accepted")

    @Test
    fun `a friend graph fetched under A and hydrated after B signed in leaves B's graph empty`() = runTest {
        val fetchedUnderA = fence.ticket()
        owner.id = null
        transition.bumpGeneration()
        fence.close { cache.clear() }
        owner.id = "B"
        transition.bumpGeneration()

        cache.hydrate(sent = listOf(acceptedBySomeoneOfA), received = emptyList(), ticket = fetchedUnderA)

        assertThat(cache.currentFriendIds).isEmpty()
        assertThat(cache.isHydrated).isFalse()
    }

    @Test
    fun `a friend graph fetched under the current account lands`() = runTest {
        cache.hydrate(sent = listOf(acceptedBySomeoneOfA), received = emptyList(), ticket = fence.ticket())

        assertThat(cache.currentFriendIds).containsExactly("ami-de-A")
    }
}
