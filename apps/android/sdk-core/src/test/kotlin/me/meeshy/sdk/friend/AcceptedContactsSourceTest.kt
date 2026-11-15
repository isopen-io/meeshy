package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

class AcceptedContactsSourceTest {

    private fun user(id: String, online: Boolean? = null) =
        FriendRequestUser(id = id, username = id, displayName = id.uppercase(), isOnline = online)

    private fun relation(sender: FriendRequestUser, receiver: FriendRequestUser, status: String = "accepted") =
        FriendRequest(id = "${sender.id}-${receiver.id}", senderId = sender.id, receiverId = receiver.id, status = status, sender = sender, receiver = receiver)

    private fun source(
        cache: FriendListRepository = mockk(relaxed = true),
        network: FriendRepository = mockk(),
    ) = AcceptedContactsSource(
        network,
        cache,
        mockk<SessionRepository> { every { currentUserId } returns "me" },
    )

    @Test
    fun `the cache is served without touching the network`() = runTest {
        val cache = mockk<FriendListRepository> { coEvery { cachedSnapshot() } returns listOf(user("ann")) }
        val network = mockk<FriendRepository>()

        val cached = source(cache, network).cached()

        assertThat(cached!!.map { it.id }).containsExactly("ann")
        coVerify(exactly = 0) { network.acceptedFriendRequests() }
    }

    @Test
    fun `a cold cache reads as null`() = runTest {
        val cache = mockk<FriendListRepository> { coEvery { cachedSnapshot() } returns null }
        assertThat(source(cache).cached()).isNull()
    }

    @Test
    fun `a relation where I am the receiver is a contact and the roster is persisted once`() = runTest {
        val me = user("me")
        val cache = mockk<FriendListRepository>(relaxed = true)
        val network = mockk<FriendRepository> {
            coEvery { acceptedFriendRequests() } returns NetworkResult.Success(
                listOf(relation(user("ann"), me), relation(me, user("bob")), relation(user("bob"), me), relation(user("cy"), me, "pending")),
            )
        }

        val result = source(cache, network).refresh()

        assertThat((result as NetworkResult.Success).data.map { it.id }).containsExactly("ann", "bob")
        coVerify(exactly = 1) { cache.persist(match { roster -> roster.map { it.id }.toSet() == setOf("ann", "bob") }, any()) }
    }

    @Test
    fun `a failed read never touches the cache`() = runTest {
        val cache = mockk<FriendListRepository>(relaxed = true)
        val network = mockk<FriendRepository> {
            coEvery { acceptedFriendRequests() } returns NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        }

        val result = source(cache, network).refresh()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 0) { cache.persist(any(), any()) }
    }

    @Test
    fun `a cache that cannot be written still serves the fresh roster`() = runTest {
        val cache = mockk<FriendListRepository>(relaxed = true) {
            coEvery { persist(any(), any()) } throws IllegalStateException("disk")
        }
        val network = mockk<FriendRepository> {
            coEvery { acceptedFriendRequests() } returns NetworkResult.Success(listOf(relation(user("ann"), user("me"))))
        }

        val result = source(cache, network).refresh()

        assertThat((result as NetworkResult.Success).data.map { it.id }).containsExactly("ann")
    }
}
