package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NotificationRepositoryResyncTest {

    private fun row(id: String) = ApiNotification(id = id, state = NotificationState(isRead = false, createdAt = "2026-10-22T00:00:00.000Z"))

    @Test
    fun `la resynchro remplace le cache all et recale le compteur`() = runTest {
        val api: NotificationApi = mockk(relaxed = true)
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = listOf(row("a"), row("b")))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 7)
        val repo = NotificationRepository(api)

        val failure = repo.resync()

        assertThat(failure).isNull()
        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("a", "b")
        assertThat(repo.unreadCountStream.value).isEqualTo(7)
    }

    @Test
    fun `la liste en echec laisse le cache intact mais le compteur est quand meme recale`() = runTest {
        val api: NotificationApi = mockk(relaxed = true)
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = listOf(row("a")))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 1)
        val repo = NotificationRepository(api).also { it.resync() }
        coEvery { api.list(any(), any(), any(), any()) } throws java.io.IOException("hors ligne")
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 9)

        val failure = repo.resync()

        assertThat(failure).isNotNull()
        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("a")
        assertThat(repo.unreadCountStream.value).isEqualTo(9)
    }
}
