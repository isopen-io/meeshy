package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
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

    private fun readRow(id: String) = ApiNotification(id = id, state = NotificationState(isRead = true, createdAt = "2026-10-22T00:00:00.000Z"))

    /** Amorce le cache avec [a] (lue, compteur 0), puis fait SUSPENDRE la prochaine resynchro sur les deux portes. */
    private suspend fun resyncInFlight(
        api: NotificationApi,
        listGate: CompletableDeferred<ApiResponse<List<ApiNotification>>>,
        countGate: CompletableDeferred<UnreadCountResponse>,
    ): NotificationRepository {
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = listOf(readRow("a")))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 0)
        val repo = NotificationRepository(api).also { it.resync() }
        coEvery { api.list(any(), any(), any(), any()) } coAnswers { listGate.await() }
        coEvery { api.unreadCount() } coAnswers { countGate.await() }
        return repo
    }

    @Test
    fun `une notification arrivee pendant la resynchro et son compteur survivent aux reponses calculees avant elle`() = runTest {
        val api: NotificationApi = mockk(relaxed = true)
        val listGate = CompletableDeferred<ApiResponse<List<ApiNotification>>>()
        val countGate = CompletableDeferred<UnreadCountResponse>()
        val repo = resyncInFlight(api, listGate, countGate)

        val resync = async { repo.resync() }
        runCurrent()
        repo.prependLive(row("n"))
        repo.applyCounts(1)
        listGate.complete(ApiResponse(success = true, data = listOf(readRow("a"))))
        countGate.complete(UnreadCountResponse(success = true, count = 0))
        resync.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("n", "a").inOrder()
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `une ligne arrivee puis supprimee pendant la resynchro ne ressuscite pas`() = runTest {
        val api: NotificationApi = mockk(relaxed = true)
        val listGate = CompletableDeferred<ApiResponse<List<ApiNotification>>>()
        val countGate = CompletableDeferred<UnreadCountResponse>()
        val repo = resyncInFlight(api, listGate, countGate)

        val resync = async { repo.resync() }
        runCurrent()
        repo.prependLive(row("n"))
        repo.applyDeleted("n")
        listGate.complete(ApiResponse(success = true, data = listOf(readRow("a"))))
        countGate.complete(UnreadCountResponse(success = true, count = 0))
        resync.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("a")
    }

    @Test
    fun `sans rien d'arrive pendant le vol la page et le compteur du serveur s'appliquent`() = runTest {
        val api: NotificationApi = mockk(relaxed = true)
        val listGate = CompletableDeferred<ApiResponse<List<ApiNotification>>>()
        val countGate = CompletableDeferred<UnreadCountResponse>()
        val repo = resyncInFlight(api, listGate, countGate)

        val resync = async { repo.resync() }
        runCurrent()
        listGate.complete(ApiResponse(success = true, data = listOf(row("b"))))
        countGate.complete(UnreadCountResponse(success = true, count = 4))
        resync.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("b")
        assertThat(repo.unreadCountStream.value).isEqualTo(4)
    }

    @Test
    fun `une resynchro en vol quand le compte change n'ecrit rien chez le suivant`() = runTest {
        val api: NotificationApi = mockk(relaxed = true)
        val listGate = CompletableDeferred<ApiResponse<List<ApiNotification>>>()
        val countGate = CompletableDeferred<UnreadCountResponse>()
        val repo = resyncInFlight(api, listGate, countGate)

        val resync = async { repo.resync() }
        runCurrent()
        repo.clear()
        listGate.complete(ApiResponse(success = true, data = listOf(row("ancien-compte"))))
        countGate.complete(UnreadCountResponse(success = true, count = 9))
        resync.await()

        assertThat(repo.cachedItems(NotificationScope.All)).isNull()
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }
}
