package me.meeshy.sdk.notification

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MarkReadResponse
import me.meeshy.sdk.model.NotificationContext
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test
import java.io.IOException

/**
 * La consommation d'une conversation ou d'un post : l'ouvrir passe ses notifications à lues,
 * sans bloquer l'écran, sans double décompte, et sans rien casser si le réseau échoue.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationRepositoryConsumptionTest {

    private val api: NotificationApi = mockk(relaxed = true)

    private fun notification(
        id: String,
        isRead: Boolean = false,
        conversationId: String? = null,
        postId: String? = null,
    ) = ApiNotification(
        id = id,
        type = "new_message",
        state = NotificationState(isRead = isRead, createdAt = "2026-10-22T00:00:00.000Z"),
        context = NotificationContext(conversationId = conversationId, postId = postId),
    )

    private suspend fun seeded(vararg items: ApiNotification): NotificationRepository {
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = items.toList())
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = items.count { !it.state.isRead })
        return NotificationRepository(api).also { it.refresh() }
    }

    private fun CacheResult<List<ApiNotification>>.notifications(): List<ApiNotification> =
        (this as? CacheResult.Fresh)?.value ?: (this as CacheResult.Stale).value

    /** `id → lue ?` des lignes que le flux sert maintenant. */
    private suspend fun NotificationRepository.rows(): Map<String, Boolean> {
        var rows: Map<String, Boolean> = emptyMap()
        notificationsStream().test {
            rows = awaitItem().notifications().associate { it.id to it.state.isRead }
            cancelAndIgnoreRemainingEvents()
        }
        return rows
    }

    @Test
    fun markConversationNotificationsAsRead_marksOnlyThatConversation_andSettlesTheBadge() = runTest {
        val repo = seeded(
            notification("a1", conversationId = "A"),
            notification("a2", conversationId = "A"),
            notification("b1", conversationId = "B"),
            notification("a3", isRead = true, conversationId = "A"),
        )
        coEvery { api.markConversationAsRead("A") } returns MarkReadResponse(success = true, count = 2)

        val result = repo.markConversationNotificationsAsRead("A")

        assertThat(result).isEqualTo(NetworkResult.Success(2))
        assertThat(repo.rows()).containsExactly("a1", true, "a2", true, "b1", false, "a3", true)
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        coVerify(exactly = 1) { api.markConversationAsRead("A") }
    }

    @Test
    fun markConversationNotificationsAsRead_rollsBackOnlyItsOwnRows_whenTheCallFails() = runTest {
        val repo = seeded(
            notification("a1", conversationId = "A"),
            notification("b1", conversationId = "B"),
        )
        coEvery { api.markConversationAsRead("A") } throws IOException("offline")

        val result = repo.markConversationNotificationsAsRead("A")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(repo.rows()).containsExactly("a1", false, "b1", false)
        assertThat(repo.unreadCountStream.value).isEqualTo(2)
    }

    @Test
    fun markConversationNotificationsAsRead_isIdempotent_theBadgeNeverDoubleDecrements() = runTest {
        val repo = seeded(
            notification("a1", conversationId = "A"),
            notification("b1", conversationId = "B"),
        )
        coEvery { api.markConversationAsRead("A") } returns MarkReadResponse(success = true, count = 1)

        repo.markConversationNotificationsAsRead("A")
        repo.markConversationNotificationsAsRead("A")

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        assertThat(repo.rows()).containsExactly("a1", true, "b1", false)
    }

    /** L'écran lance l'appel sans l'attendre : un second `onResume` pendant le vol ne double pas la requête. */
    @Test
    fun markConversationNotificationsAsRead_collapsesAConcurrentIdenticalCall() = runTest {
        val repo = seeded(notification("a1", conversationId = "A"))
        val release = CompletableDeferred<Unit>()
        coEvery { api.markConversationAsRead("A") } coAnswers {
            release.await()
            MarkReadResponse(success = true, count = 1)
        }

        val first = launch { repo.markConversationNotificationsAsRead("A") }
        testScheduler.runCurrent()
        val second = repo.markConversationNotificationsAsRead("A")
        release.complete(Unit)
        first.join()

        assertThat(second).isEqualTo(NetworkResult.Success(0))
        coVerify(exactly = 1) { api.markConversationAsRead("A") }
    }

    /** Un identifiant vide donnerait `notifications/conversation//read` : un 404 permanent, qui ne part donc pas. */
    @Test
    fun markConversationNotificationsAsRead_withABlankId_sendsNothing() = runTest {
        val repo = seeded(notification("a1", conversationId = "A"))

        val result = repo.markConversationNotificationsAsRead("  ")

        assertThat(result).isEqualTo(NetworkResult.Success(0))
        coVerify(exactly = 0) { api.markConversationAsRead(any()) }
    }

    @Test
    fun markConversationNotificationsAsRead_withNoCachedRow_stillAsksTheServer() = runTest {
        val repo = NotificationRepository(api)
        coEvery { api.markConversationAsRead("A") } returns MarkReadResponse(success = true, count = 3)

        val result = repo.markConversationNotificationsAsRead("A")

        assertThat(result).isEqualTo(NetworkResult.Success(3))
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    @Test
    fun markPostNotificationsAsRead_marksOnlyThatPost() = runTest {
        val repo = seeded(
            notification("p1", postId = "P"),
            notification("p2", postId = "Q"),
            notification("c1", conversationId = "A"),
        )
        coEvery { api.markPostAsRead("P") } returns MarkReadResponse(success = true, count = 1)

        val result = repo.markPostNotificationsAsRead("P")

        assertThat(result).isEqualTo(NetworkResult.Success(1))
        assertThat(repo.rows()).containsExactly("p1", true, "p2", false, "c1", false)
        assertThat(repo.unreadCountStream.value).isEqualTo(2)
    }

    @Test
    fun markPostNotificationsAsRead_rollsBackOnFailure() = runTest {
        val repo = seeded(notification("p1", postId = "P"))
        coEvery { api.markPostAsRead("P") } throws IOException("offline")

        repo.markPostNotificationsAsRead("P")

        assertThat(repo.rows()).containsExactly("p1", false)
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }

    /** Une conversation et un post peuvent partager un identifiant sans que leurs appels se confondent. */
    @Test
    fun aConversationAndAPostWithTheSameIdAreDistinctConsumptions() = runTest {
        val repo = seeded(notification("x1", conversationId = "X"), notification("x2", postId = "X"))
        coEvery { api.markConversationAsRead("X") } returns MarkReadResponse(success = true, count = 1)
        coEvery { api.markPostAsRead("X") } returns MarkReadResponse(success = true, count = 1)

        repo.markConversationNotificationsAsRead("X")
        repo.markPostNotificationsAsRead("X")

        coVerify(exactly = 1) { api.markConversationAsRead("X") }
        coVerify(exactly = 1) { api.markPostAsRead("X") }
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }
}
