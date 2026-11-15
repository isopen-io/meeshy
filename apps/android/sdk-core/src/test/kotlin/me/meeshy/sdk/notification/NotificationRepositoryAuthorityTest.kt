package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test

/** Le socket est l'autorité : le disque ensemence les inconnues et ne régresse jamais une valeur déjà possédée. */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationRepositoryAuthorityTest {

    private class MemoryStore(val persisted: PersistedNotifications?) : NotificationCacheStore {
        override suspend fun read() = persisted
        override suspend fun write(snapshot: PersistedNotifications, stillValid: () -> Boolean) = Unit
    }

    private class Clock : CacheClock {
        override fun nowMillis() = 100_000_000L
    }

    private val api: NotificationApi = mockk(relaxed = true)

    private fun notification(id: String, isRead: Boolean) =
        ApiNotification(id = id, state = NotificationState(isRead = isRead, createdAt = "2026-08-17T00:00:00.000Z"))

    private fun TestScope.newRepo(disk: List<ApiNotification>) = NotificationRepository(
        api,
        Clock(),
        MemoryStore(PersistedNotifications(disk, null, false, disk.size, 100_000_000L - 1_000)),
        StandardTestDispatcher(testScheduler),
    )

    @Test
    fun `une liste deja possedee par la memoire n est pas ecrasee par le disque`() = runTest {
        val repo = newRepo(listOf(notification("a", isRead = false)))
        repo.replaceAll(NotificationScope.All, listOf(notification("a", isRead = true)))

        repo.notificationsStream().first()

        assertThat(repo.cachedItems(NotificationScope.All)!!.single().state.isRead).isTrue()
    }
}
