package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test

/** Plafond, rétention, ensemencement sans régression et vidage disque de la liste persistée. */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationCacheSourceTest {

    private class MemoryStore(var persisted: PersistedNotifications? = null) : NotificationCacheStore {
        var clears = 0
        override suspend fun read() = persisted
        override suspend fun write(snapshot: PersistedNotifications, stillValid: () -> Boolean) {
            if (stillValid()) persisted = snapshot
        }
        override suspend fun clear() {
            clears += 1
            persisted = null
        }
    }

    private class Clock(var now: Long = 100_000_000L) : CacheClock {
        override fun nowMillis() = now
    }

    private val api: NotificationApi = mockk(relaxed = true)
    private val clock = Clock()

    private fun notification(id: String, isRead: Boolean = false) =
        ApiNotification(id = id, state = NotificationState(isRead = isRead, createdAt = "2026-08-17T00:00:00.000Z"))

    private fun snapshot(ids: List<String>, ageMillis: Long) =
        PersistedNotifications(ids.map { notification(it) }, null, false, ids.size, clock.now - ageMillis)

    private fun TestScope.newRepo(store: NotificationCacheStore) =
        NotificationRepository(api, clock, store, StandardTestDispatcher(testScheduler))

    private fun serve(vararg items: ApiNotification) {
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(
            success = true,
            data = items.toList(),
            pagination = Pagination(limit = 30, hasMore = false, nextCursor = null),
        )
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = items.size)
    }

    @Test
    fun `un disque plus vieux que 24 h n est pas rejoue`() = runTest {
        serve(notification("n"))
        val repo = newRepo(MemoryStore(snapshot(listOf("old"), ageMillis = 25 * 60 * 60 * 1000L)))

        repo.notificationsStream().first()

        assertThat(repo.cachedItems(NotificationScope.All)).isNull()
    }

    @Test
    fun `un disque de 23 h est rejoue`() = runTest {
        val repo = newRepo(MemoryStore(snapshot(listOf("a"), ageMillis = 23 * 60 * 60 * 1000L)))

        repo.notificationsStream().first()

        assertThat(repo.cachedItems(NotificationScope.All)?.map { it.id }).containsExactly("a")
    }

    @Test
    fun `le disque est plafonne a 200 lignes et rouvre la pagination`() = runTest {
        val ids = (1..250).map { "n$it" }
        val repo = newRepo(MemoryStore(snapshot(ids, ageMillis = 1_000)))

        repo.notificationsStream().first()

        assertThat(repo.cachedItems(NotificationScope.All)).hasSize(200)
        assertThat(repo.hasMoreStream.value).isTrue()
    }

    @Test
    fun `clear vide aussi le disque`() = runTest {
        val store = MemoryStore(snapshot(listOf("a"), ageMillis = 1_000))
        val repo = newRepo(store)
        repo.notificationsStream().first()

        repo.clear()
        advanceUntilIdle()

        assertThat(store.clears).isEqualTo(1)
        assertThat(store.persisted).isNull()
    }

    @Test
    fun `un evenement socket recu apres la relecture disque s ajoute sans regresser le cache`() = runTest {
        val store = MemoryStore(snapshot(listOf("a"), ageMillis = 1_000))
        val repo = newRepo(store)
        repo.notificationsStream().first()

        repo.prependLive(notification("live"))

        assertThat(repo.cachedItems(NotificationScope.All)?.map { it.id }).containsAtLeast("live", "a")
    }
}
