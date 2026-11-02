package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.MemberRoster
import me.meeshy.sdk.model.MemberRosterPage
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ParticipantCacheRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun member(id: String, userId: String = "u$id", role: String = "member") =
        PaginatedParticipant(id = id, userId = userId, displayName = id, conversationRole = role)

    private fun page(vararg ids: String, next: String? = null, more: Boolean = false, total: Int? = null) =
        MemberRosterPage(ids.map { member(it) }, next, more, total)

    private class Network(var answer: NetworkResult<MemberRosterPage>) {
        val calls = mutableListOf<String?>()
        val fetch: ParticipantPageFetcher = { _, cursor, _ -> calls += cursor; answer }
    }

    private fun TestScope.repository(network: Network) = ParticipantCacheRepository(
        cache = KeyedJsonCache(db.keyedJsonCacheDao(), clock),
        fetchPage = network.fetch,
        scope = this,
        clock = clock,
    )

    private fun ids(result: NetworkResult<MemberRoster>) =
        (result as NetworkResult.Success).data.members.map { it.id }

    @Test fun `cold start fetches the first page and persists cursor and total`() = runTest {
        val net = Network(NetworkResult.Success(page("a", "b", next = "b", more = true, total = 40)))
        val repo = repository(net)

        val roster = (repo.firstPage("c1") as NetworkResult.Success).data

        assertThat(roster.members.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(roster.nextCursor).isEqualTo("b")
        assertThat(roster.hasMore).isTrue()
        assertThat(roster.totalCount).isEqualTo(40)
        net.answer = NetworkResult.Failure(ApiError("offline"))
        assertThat((repo.firstPage("c1") as NetworkResult.Success).data.totalCount).isEqualTo(40)
    }

    @Test fun `a fresh cache is served without any network call`() = runTest {
        val net = Network(NetworkResult.Success(page("a")))
        val repo = repository(net)
        repo.firstPage("c1")
        clock.now += 60_000

        assertThat(ids(repo.firstPage("c1"))).containsExactly("a")
        assertThat(net.calls).hasSize(1)
    }

    @Test fun `a stale cache is served at once then revalidated silently`() = runTest {
        val net = Network(NetworkResult.Success(page("a")))
        val repo = repository(net)
        repo.firstPage("c1")
        clock.now += 10 * 60_000
        net.answer = NetworkResult.Success(page("a", "b"))

        assertThat(ids(repo.firstPage("c1"))).containsExactly("a")
        advanceUntilIdle()

        assertThat(net.calls).hasSize(2)
        val revalidated = repo.observe("c1").first { roster -> roster?.members?.size == 2 }
        assertThat(revalidated?.members?.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(ids(repo.firstPage("c1"))).containsExactly("a", "b").inOrder()
    }

    @Test fun `forceRefresh leaves the cache untouched until the network answered`() = runTest {
        val net = Network(NetworkResult.Success(page("a")))
        val repo = repository(net)
        repo.firstPage("c1")
        net.answer = NetworkResult.Failure(ApiError("offline"))

        val failed = repo.firstPage("c1", forceRefresh = true)

        assertThat(ids(failed)).containsExactly("a")
        net.answer = NetworkResult.Success(page("z"))
        assertThat(ids(repo.firstPage("c1", forceRefresh = true))).containsExactly("z")
        assertThat(ids(repo.firstPage("c1"))).containsExactly("z")
    }

    @Test fun `a failed network with an expired disk copy serves the disk`() = runTest {
        val net = Network(NetworkResult.Success(page("a")))
        val repo = repository(net)
        repo.firstPage("c1")
        clock.now += 3 * 24 * 3_600_000L
        net.answer = NetworkResult.Failure(ApiError("offline"))

        assertThat(ids(repo.firstPage("c1"))).containsExactly("a")
    }

    @Test fun `a failed network with nothing on disk is a failure`() = runTest {
        val repo = repository(Network(NetworkResult.Failure(ApiError("offline"))))

        assertThat(repo.firstPage("c1")).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test fun `next pages go through the network and are deduplicated by id`() = runTest {
        val net = Network(NetworkResult.Success(page("a", "b", next = "b", more = true)))
        val repo = repository(net)
        repo.firstPage("c1")
        net.answer = NetworkResult.Success(page("b", "c"))

        val roster = repo.nextPage("c1")

        assertThat(ids(roster)).containsExactly("a", "b", "c").inOrder()
        assertThat(net.calls).containsExactly(null, "b").inOrder()
    }

    @Test fun `on the last page the disk copy is returned as is`() = runTest {
        val net = Network(NetworkResult.Success(page("a")))
        val repo = repository(net)
        repo.firstPage("c1")

        assertThat(ids(repo.nextPage("c1"))).containsExactly("a")
        assertThat(net.calls).hasSize(1)
    }

    @Test fun `a failed next page keeps the cache`() = runTest {
        val net = Network(NetworkResult.Success(page("a", next = "a", more = true)))
        val repo = repository(net)
        repo.firstPage("c1")
        net.answer = NetworkResult.Failure(ApiError("offline"))

        assertThat(repo.nextPage("c1")).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(ids(repo.firstPage("c1"))).containsExactly("a")
    }

    @Test fun `updateRole matches a user id or a participant id and lowercases the role`() = runTest {
        val net = Network(NetworkResult.Success(page("a", "b")))
        val repo = repository(net)
        repo.firstPage("c1")

        repo.updateRole("c1", "ua", "MODERATOR")
        repo.updateRole("c1", "b", "Admin")

        val roles = (repo.firstPage("c1") as NetworkResult.Success).data.members.map { it.conversationRole }
        assertThat(roles).containsExactly("moderator", "admin").inOrder()
        assertThat(net.calls).hasSize(1)
    }

    @Test fun `removeParticipant drops the row and decrements the total without any network`() = runTest {
        val net = Network(NetworkResult.Success(page("a", "b", total = 10)))
        val repo = repository(net)
        repo.firstPage("c1")

        repo.removeParticipant("c1", "ua")

        val roster = (repo.firstPage("c1") as NetworkResult.Success).data
        assertThat(roster.members.map { it.id }).containsExactly("b")
        assertThat(roster.totalCount).isEqualTo(9)
        assertThat(net.calls).hasSize(1)
    }

    @Test fun `a local mutation does not make a stale cache look fresh`() = runTest {
        val net = Network(NetworkResult.Success(page("a", "b")))
        val repo = repository(net)
        repo.firstPage("c1")
        clock.now += 10 * 60_000

        repo.removeParticipant("c1", "ua")
        repo.firstPage("c1")
        advanceUntilIdle()

        assertThat(net.calls).hasSize(2)
    }

    @Test fun `invalidate forgets the roster`() = runTest {
        val net = Network(NetworkResult.Success(page("a")))
        val repo = repository(net)
        repo.firstPage("c1")

        repo.invalidate("c1")
        repo.firstPage("c1")

        assertThat(net.calls).hasSize(2)
    }

    @Test fun `user updated repaints the matching member of every cached roster by userId`() = runTest {
        val net = Network(NetworkResult.Success(page("a", "b")))
        val repo = repository(net)
        repo.firstPage("c1")
        repo.firstPage("c2")

        val changed = repo.repaint(
            me.meeshy.sdk.model.UserUpdatedEvent(
                userId = "ua", displayName = "Zed", username = "zed", hasNameGroup = true,
                avatar = me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange.Replaced("https://x/new.png"),
            ),
        )

        assertThat(changed).isEqualTo(2)
        val roster = (repo.firstPage("c1") as NetworkResult.Success).data
        assertThat(roster.members.first { it.id == "a" }.displayName).isEqualTo("Zed")
        assertThat(roster.members.first { it.id == "a" }.avatar).isEqualTo("https://x/new.png")
        assertThat(roster.members.first { it.id == "b" }.displayName).isEqualTo("b")
    }

    @Test fun `user updated for an unknown user rewrites nothing`() = runTest {
        val repo = repository(Network(NetworkResult.Success(page("a"))))
        repo.firstPage("c1")

        assertThat(repo.repaint(me.meeshy.sdk.model.UserUpdatedEvent(userId = "nobody", username = "n", hasNameGroup = true))).isEqualTo(0)
    }
}
