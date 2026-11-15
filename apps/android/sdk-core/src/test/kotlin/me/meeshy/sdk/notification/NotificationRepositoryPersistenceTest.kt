package me.meeshy.sdk.notification

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.session.AccountFence
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

/** Le cache persistant de la liste : cache-first au démarrage à froid, hors ligne, pagination et déconnexion. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class NotificationRepositoryPersistenceTest {

    private class MemoryStore(var persisted: PersistedNotifications? = null) : NotificationCacheStore {
        val writes = mutableListOf<PersistedNotifications>()
        override suspend fun read() = persisted
        override suspend fun write(snapshot: PersistedNotifications, stillValid: () -> Boolean) {
            if (!stillValid()) return
            writes += snapshot
            persisted = snapshot
        }
    }

    private class Clock(var now: Long = 10_000_000L) : CacheClock {
        override fun nowMillis() = now
    }

    private val api: NotificationApi = mockk(relaxed = true)
    private val clock = Clock()

    private fun notification(id: String, isRead: Boolean = false, createdAt: String = "2026-08-17T00:00:00.000Z") =
        ApiNotification(id = id, state = NotificationState(isRead = isRead, createdAt = createdAt))

    private fun persisted(vararg ids: String, ageMillis: Long, cursor: String? = null, hasMore: Boolean = false) =
        PersistedNotifications(ids.map { notification(it) }, cursor, hasMore, unreadCount = ids.size, syncedAt = clock.now - ageMillis)

    private fun TestScope.newRepo(store: NotificationCacheStore) =
        NotificationRepository(api, clock, store, StandardTestDispatcher(testScheduler))

    private fun serve(vararg items: ApiNotification, hasMore: Boolean = false, cursor: String? = null) {
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(
            success = true,
            data = items.toList(),
            pagination = Pagination(limit = 30, hasMore = hasMore, nextCursor = cursor),
        )
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = items.size)
    }

    private fun CacheResult<List<ApiNotification>>.ids(): List<String> = when (this) {
        is CacheResult.Fresh -> value
        is CacheResult.Stale -> value
        is CacheResult.Syncing -> value.orEmpty()
        else -> emptyList()
    }.map { it.id }

    @Test
    fun `un cache frais est servi au premier cadre sans aucun reseau`() = runTest {
        val repo = newRepo(MemoryStore(persisted("a", "b", ageMillis = 1_000)))

        repo.notificationsStream().test {
            val first = awaitItem()
            assertThat(first).isInstanceOf(CacheResult.Fresh::class.java)
            assertThat(first.ids()).containsExactly("a", "b").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 0) { api.list(any(), any(), any(), any()) }
    }

    @Test
    fun `un cache perime est servi puis revalide en silence`() = runTest {
        serve(notification("n"), cursor = null)
        val repo = newRepo(MemoryStore(persisted("a", ageMillis = 6 * 60 * 1000)))

        repo.notificationsStream().test {
            val first = awaitItem()
            assertThat(first).isInstanceOf(CacheResult.Stale::class.java)
            assertThat(first.ids()).containsExactly("a")
            assertThat(awaitItem().ids()).containsExactly("n")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `sans cache le flux rend Empty`() = runTest {
        serve()
        val repo = newRepo(MemoryStore())

        repo.notificationsStream().test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `un echec reseau n ecrase jamais les lignes en cache`() = runTest {
        coEvery { api.list(any(), any(), any(), any()) } throws IOException("hors ligne")
        coEvery { api.unreadCount() } throws IOException("hors ligne")
        val store = MemoryStore(persisted("a", "b", ageMillis = 6 * 60 * 1000))
        val repo = newRepo(store)

        repo.notificationsStream().test {
            assertThat(awaitItem().ids()).containsExactly("a", "b")
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
        advanceUntilIdle()
        assertThat(store.persisted!!.items.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `une arrivee en direct avant tout chargement ne fabrique aucune ligne mais compte`() = runTest {
        val store = MemoryStore()
        val repo = newRepo(store)

        repo.prependLive(notification("live"))
        advanceUntilIdle()

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        assertThat(repo.cachedItems(NotificationScope.All)).isNull()
        assertThat(store.writes).isEmpty()
    }

    @Test
    fun `la pagination survit a la mort du process avec la liste`() = runTest {
        serve(notification("n1"), notification("n2"), hasMore = true, cursor = "ancre-n2")
        val store = MemoryStore()
        val repo = newRepo(store)
        repo.refresh()
        advanceUntilIdle()

        val reborn = newRepo(store)
        coEvery { api.list(null, any(), any(), "ancre-n2") } returns ApiResponse(
            success = true,
            data = listOf(notification("n3")),
            pagination = Pagination(limit = 30, hasMore = false, nextCursor = null),
        )
        reborn.notificationsStream().test {
            assertThat(awaitItem().ids()).containsExactly("n1", "n2").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(reborn.hasMoreStream.value).isTrue()
        reborn.loadMore()
        assertThat(reborn.cachedItems(NotificationScope.All)!!.map { it.id }).containsExactly("n1", "n2", "n3").inOrder()
        coVerify(exactly = 1) { api.list(null, 30, null, "ancre-n2") }
    }

    @Test
    fun `clear vide la memoire, les portees et n ecrit plus rien`() = runTest {
        serve(notification("n1"))
        val store = MemoryStore()
        val repo = newRepo(store)
        repo.refresh()
        repo.replaceAll(NotificationScope(unreadOnly = true), listOf(notification("n1")))
        advanceUntilIdle()
        val writes = store.writes.size

        repo.clear()
        advanceUntilIdle()

        assertThat(repo.cachedItems(NotificationScope.All)).isNull()
        assertThat(repo.cachedItems(NotificationScope(unreadOnly = true))).isNull()
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
        assertThat(store.writes).hasSize(writes)
    }

    @Test
    fun `les primitives de patch sont idempotentes`() = runTest {
        serve(notification("n1"), notification("n2"))
        val repo = newRepo(MemoryStore())
        repo.refresh()

        repeat(2) { repo.patch { it.map { n -> if (n.id == "n1") n.copy(state = n.state.copy(isRead = true)) else n } } }
        repeat(2) { repo.setUnreadCount(5) }

        assertThat(repo.cachedItems(NotificationScope.All)!!.map { it.state.isRead }).containsExactly(true, false).inOrder()
        assertThat(repo.unreadCountStream.value).isEqualTo(5)
    }

    @Test
    fun `le cache Room rend ce qu on lui a confie avec son curseur`() = kotlinx.coroutines.runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        val store = RoomNotificationCacheStore(
            db, db.notificationDao(), db.keyedJsonCacheDao(),
            AccountFence(object : me.meeshy.sdk.outbox.OutboxOwnerSource { override fun currentOwnerId() = "A" }),
            kotlinx.coroutines.Dispatchers.Unconfined,
        )
        val snapshot = PersistedNotifications(
            items = listOf(notification("b", createdAt = "2026-08-18T00:00:00.000Z"), notification("a")),
            nextCursor = "c", hasMore = true, unreadCount = 2, syncedAt = 42L,
        )

        assertThat(store.read()).isNull()
        store.write(snapshot) { true }
        store.write(snapshot) { true }

        assertThat(store.read()).isEqualTo(snapshot)
        db.clearAllTables()
        assertThat(store.read()).isNull()
        db.close()
    }
}
