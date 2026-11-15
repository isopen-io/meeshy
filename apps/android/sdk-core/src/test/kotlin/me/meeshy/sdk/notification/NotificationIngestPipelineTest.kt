package me.meeshy.sdk.notification

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.friend.PersistedFriendCaches
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationContext
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NotificationIngestPipelineTest {

    private class Clock(var now: Long = 1_000_000) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private class CountingCaches : PersistedFriendCaches {
        var invalidations = 0
        override suspend fun invalidate() {
            invalidations++
        }
        override suspend fun seed() = null
    }

    private class Fixture(
        val api: NotificationApi,
        val repo: NotificationRepository,
        val events: NotificationConsumptionEvents,
        val friends: FriendshipCache,
        val caches: CountingCaches,
        val clock: Clock,
        val incoming: MutableSharedFlow<ApiNotification>,
        val pipeline: NotificationIngestPipeline,
    ) {
        fun rows(): Map<String, Boolean> =
            repo.cachedItems(NotificationScope.All).orEmpty().associate { it.id to it.state.isRead }
    }

    private fun notification(
        id: String,
        isRead: Boolean = false,
        type: String = "new_message",
        conversationId: String? = null,
        actorId: String? = null,
        friendRequestId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
        actor = actorId?.let { NotificationActor(id = it) },
        state = NotificationState(isRead = isRead, createdAt = "2026-10-22T00:00:00.000Z"),
        context = NotificationContext(conversationId = conversationId, friendRequestId = friendRequestId),
    )

    private suspend fun TestScope.fixture(
        loaded: List<ApiNotification>? = emptyList(),
        open: Set<String> = emptySet(),
    ): Fixture {
        val api: NotificationApi = mockk(relaxed = true)
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = loaded.orEmpty())
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = loaded.orEmpty().count { !it.state.isRead })
        coEvery { api.markAsRead(any()) } returns ApiResponse(success = true, data = notification("ok"))
        val repo = NotificationRepository(api).also { if (loaded != null) it.refresh() }
        val events = NotificationConsumptionEvents()
        val clock = Clock()
        val consumption = NotificationConsumptionService(repo, api, events, clock)
        val caches = CountingCaches()
        val friends = FriendshipCache(caches, null)
        val incoming = MutableSharedFlow<ApiNotification>()
        val pipeline = NotificationIngestPipeline(
            incoming, repo, consumption, events, api, friends, { open }, clock,
            kotlinx.coroutines.CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
        )
        return Fixture(api, repo, events, friends, caches, clock, incoming, pipeline)
    }

    @Test
    fun `une notification d'une conversation ouverte est persistee lue sans toucher au compteur`() = runTest {
        val f = fixture(loaded = listOf(notification("old")), open = setOf("c1"))
        val before = f.repo.unreadCountStream.value

        f.events.notificationMarkedRead.test {
            f.pipeline.ingest(notification("n1", conversationId = "c1"))
            assertThat(awaitItem()).isEqualTo("n1")
        }

        assertThat(f.rows()).containsEntry("n1", true)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(before)
        coVerify(exactly = 1) { f.api.markAsRead("n1") }
    }

    @Test
    fun `une conversation ouverte n'est annoncee a personne comme arrivee non lue`() = runTest {
        val f = fixture(open = setOf("c1"))

        f.pipeline.arrived.test {
            f.pipeline.ingest(notification("n1", conversationId = "c1"))
            expectNoEvents()
        }
    }

    @Test
    fun `une notification d'un autre contenu est inseree non lue et comptee`() = runTest {
        val f = fixture(loaded = emptyList(), open = setOf("c1"))

        f.pipeline.arrived.test {
            f.pipeline.ingest(notification("n2", conversationId = "c2"))
            assertThat(awaitItem().id).isEqualTo("n2")
        }

        assertThat(f.rows()).containsEntry("n2", false)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
        coVerify(exactly = 0) { f.api.markAsRead(any()) }
    }

    @Test
    fun `un doublon APN plus socket sous 2 s ne compte qu'une fois`() = runTest {
        val f = fixture(loaded = null)

        f.pipeline.ingest(notification("n1"))
        f.clock.now += 1_000
        f.pipeline.ingest(notification("n1"))

        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `aucun cache d'un seul element n'est fabrique quand la liste n'a jamais ete chargee`() = runTest {
        val f = fixture(loaded = null)

        f.pipeline.ingest(notification("n1"))

        assertThat(f.repo.cachedItems(NotificationScope.All)).isNull()
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `une demande d'ami recue met a jour le cache d'amitie et invalide les caches persistes`() = runTest {
        val f = fixture()

        f.pipeline.ingest(notification("n1", type = "friend_request", actorId = "alice", friendRequestId = "r1"))

        assertThat(f.friends.currentReceivedPendingSenderIds).containsExactly("alice")
        assertThat(f.caches.invalidations).isEqualTo(1)
    }

    @Test
    fun `une acceptation d'ami fait de l'accepteur un ami`() = runTest {
        val f = fixture()
        f.friends.didSendRequest("bob", "r2")

        f.pipeline.ingest(notification("n2", type = "friend_accepted", actorId = "bob"))

        assertThat(f.friends.isFriend("bob")).isTrue()
        assertThat(f.caches.invalidations).isEqualTo(1)
    }
}
