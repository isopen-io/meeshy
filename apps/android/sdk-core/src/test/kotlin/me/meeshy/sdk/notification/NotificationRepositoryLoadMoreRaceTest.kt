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
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test

/**
 * Une page de pagination en vol ne remplace jamais la liste lue AVANT l'appel : ce qui est arrivé, a été lu ou a été
 * supprimé pendant le vol (socket, autre appareil, balayage) se garde.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationRepositoryLoadMoreRaceTest {

    private val api: NotificationApi = mockk(relaxed = true)

    private fun row(id: String, isRead: Boolean = false) =
        ApiNotification(id = id, state = NotificationState(isRead = isRead, createdAt = "2026-11-17T00:00:00.000Z"))

    private fun page(vararg rows: ApiNotification, hasMore: Boolean = false, nextCursor: String? = null) = ApiResponse(
        success = true,
        data = rows.toList(),
        pagination = Pagination(limit = 30, hasMore = hasMore, nextCursor = nextCursor),
    )

    private suspend fun seeded(): NotificationRepository {
        coEvery { api.list(any(), any(), any(), any()) } returns page(row("n1"), row("n2"), hasMore = true, nextCursor = "ancre-n2")
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 2)
        return NotificationRepository(api).also { it.refresh() }
    }

    private fun NotificationRepository.ids() = cachedItems(NotificationScope.All)?.map { it.id }

    @Test
    fun `une arrivee en direct, une suppression et un lu venus pendant le vol survivent a la page`() = runTest {
        val repo = seeded()
        val gate = CompletableDeferred<ApiResponse<List<ApiNotification>>>()
        coEvery { api.list(any(), any(), any(), "ancre-n2") } coAnswers { gate.await() }

        val loading = async { repo.loadMore() }
        runCurrent()
        repo.prependLive(row("n9"))
        repo.applyDeleted("n1")
        repo.applyRead("n2")
        gate.complete(page(row("n3"), hasMore = false))
        loading.await()

        assertThat(repo.ids()).containsExactly("n9", "n2", "n3").inOrder()
        assertThat(repo.cachedItems(NotificationScope.All)!!.first { it.id == "n2" }.state.isRead).isTrue()
    }

    @Test
    fun `un clear pendant le vol laisse la liste vide, la page de l'ancien compte est jetee`() = runTest {
        val repo = seeded()
        val gate = CompletableDeferred<ApiResponse<List<ApiNotification>>>()
        coEvery { api.list(any(), any(), any(), "ancre-n2") } coAnswers { gate.await() }

        val loading = async { repo.loadMore() }
        runCurrent()
        repo.clear()
        gate.complete(page(row("n3"), hasMore = true, nextCursor = "ancre-n3"))
        loading.await()

        assertThat(repo.ids()).isNull()
        assertThat(repo.hasMoreStream.value).isFalse()
    }

    @Test
    fun `une revalidation qui remplace la liste pendant le vol n'est pas ecrasee par l'ancienne liste`() = runTest {
        val repo = seeded()
        val gate = CompletableDeferred<ApiResponse<List<ApiNotification>>>()
        coEvery { api.list(any(), any(), any(), "ancre-n2") } coAnswers { gate.await() }

        val loading = async { repo.loadMore() }
        runCurrent()
        coEvery { api.list(0, any(), any(), null) } returns page(row("f1"), row("f2"), hasMore = true, nextCursor = "ancre-f2")
        repo.resync()
        gate.complete(page(row("n3"), hasMore = false))
        loading.await()

        assertThat(repo.ids()).containsExactly("f1", "f2").inOrder()
        assertThat(repo.hasMoreStream.value).isTrue()
    }

    /**
     * #19141 (D3) — sans curseur (passerelle antérieure à #4901), une page demandée par RANG ne continue que la liste
     * qu'elle prolonge : une arrivée en tête pendant le vol décale les rangs, la page est jetée, et le défilement suivant
     * repart de la nouvelle fin, sans trou ni doublon.
     */
    @Test
    fun `sans curseur, une page par rang en vol est jetee si une arrivee decale la liste, le defilement suivant repart de la nouvelle fin`() =
        runTest {
            coEvery { api.list(any(), any(), any(), any()) } returns page(row("n1"), row("n2"), hasMore = true)
            coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 2)
            val repo = NotificationRepository(api).also { it.refresh() }
            val gate = CompletableDeferred<ApiResponse<List<ApiNotification>>>()
            coEvery { api.list(2, any(), any(), null) } coAnswers { gate.await() }

            val loading = async { repo.loadMore() }
            runCurrent()
            repo.prependLive(row("n9"))
            gate.complete(page(row("n3"), hasMore = true))
            loading.await()

            assertThat(repo.ids()).containsExactly("n9", "n1", "n2").inOrder()
            assertThat(repo.hasMoreStream.value).isTrue()

            coEvery { api.list(3, any(), any(), null) } returns page(row("n3"), hasMore = false)
            repo.loadMore()

            assertThat(repo.ids()).containsExactly("n9", "n1", "n2", "n3").inOrder()
        }
}
