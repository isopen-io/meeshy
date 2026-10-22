package me.meeshy.sdk.notification

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MarkReadResponse
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.ReadNotificationsByTypesRequest
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test
import java.io.IOException

/**
 * Un écran consomme une catégorie entière (les demandes d'ami) : `POST /notifications/read-by-types`,
 * avec le même aller-retour optimiste que le reste de la boîte.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationRepositoryReadByTypesTest {

    private val api: NotificationApi = mockk(relaxed = true)

    private fun notification(id: String, type: String, isRead: Boolean = false) = ApiNotification(
        id = id,
        type = type,
        state = NotificationState(isRead = isRead, createdAt = "2026-10-22T00:00:00.000Z"),
    )

    private suspend fun seeded(vararg items: ApiNotification): NotificationRepository {
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = items.toList())
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = items.count { !it.state.isRead })
        return NotificationRepository(api).also { it.refresh() }
    }

    private fun CacheResult<List<ApiNotification>>.notifications(): List<ApiNotification> =
        (this as? CacheResult.Fresh)?.value ?: (this as CacheResult.Stale).value

    private suspend fun NotificationRepository.rows(): Map<String, Boolean> {
        var rows: Map<String, Boolean> = emptyMap()
        notificationsStream().test {
            rows = awaitItem().notifications().associate { it.id to it.state.isRead }
            cancelAndIgnoreRemainingEvents()
        }
        return rows
    }

    @Test
    fun markTypesAsRead_postsTheTypesAndMarksOnlyThoseRows() = runTest {
        val repo = seeded(
            notification("f1", "friend_request"),
            notification("c1", "contact_request"),
            notification("m1", "new_message"),
            notification("f2", "friend_request", isRead = true),
        )
        val sent = slot<ReadNotificationsByTypesRequest>()
        coEvery { api.markTypesAsRead(capture(sent)) } returns MarkReadResponse(success = true, count = 2)

        val result = repo.markTypesAsRead(listOf("friend_request", "contact_request"))

        assertThat(sent.captured.types).containsExactly("friend_request", "contact_request").inOrder()
        assertThat(result).isEqualTo(NetworkResult.Success(2))
        assertThat(repo.rows()).containsExactly("f1", true, "c1", true, "m1", false, "f2", true)
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun markTypesAsRead_rollsBackTheRowsItFlipped_onFailure() = runTest {
        val repo = seeded(
            notification("f1", "friend_request"),
            notification("m1", "new_message"),
        )
        coEvery { api.markTypesAsRead(any()) } throws IOException("offline")

        val result = repo.markTypesAsRead(listOf("friend_request"))

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(repo.rows()).containsExactly("f1", false, "m1", false)
        assertThat(repo.unreadCountStream.value).isEqualTo(2)
    }

    /** Une sélection vide ne part pas : la passerelle refuserait un corps sans type (`minItems` 1). */
    @Test
    fun markTypesAsRead_withAnEmptySelection_sendsNothing() = runTest {
        val repo = seeded(notification("f1", "friend_request"))

        val result = repo.markTypesAsRead(listOf("", "  "))

        assertThat(result).isEqualTo(NetworkResult.Success(0))
        coVerify(exactly = 0) { api.markTypesAsRead(any()) }
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }

    /** Au-delà de 30 types, la sélection part en tranches : aucun type n'est perdu, les comptes s'additionnent. */
    @Test
    fun markTypesAsRead_splitsASelectionBeyondTheGatewayBound() = runTest {
        val repo = seeded(notification("t40", "type_40"), notification("t1", "type_1"))
        val sizes = mutableListOf<Int>()
        coEvery { api.markTypesAsRead(any()) } coAnswers {
            sizes += firstArg<ReadNotificationsByTypesRequest>().types.size
            MarkReadResponse(success = true, count = 1)
        }

        val result = repo.markTypesAsRead((1..40).map { "type_$it" })

        assertThat(sizes).containsExactly(30, 10).inOrder()
        assertThat(result).isEqualTo(NetworkResult.Success(2))
        assertThat(repo.rows()).containsExactly("t40", true, "t1", true)
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    /** La première tranche qui échoue arrête la suite : la tranche déjà appliquée reste appliquée. */
    @Test
    fun markTypesAsRead_stopsAtTheFirstFailingBatch_andKeepsTheAppliedOne() = runTest {
        val repo = seeded(notification("t1", "type_1"), notification("t40", "type_40"))
        var call = 0
        coEvery { api.markTypesAsRead(any()) } coAnswers {
            call += 1
            if (call == 1) MarkReadResponse(success = true, count = 1) else throw IOException("offline")
        }

        val result = repo.markTypesAsRead((1..40).map { "type_$it" })

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(repo.rows()).containsExactly("t1", true, "t40", false)
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }
}
