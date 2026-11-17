package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.notification.NotificationRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

/**
 * Une panne SANS cache, rejouée sur un vrai [NotificationRepository] (seule l'API est simulée) : « Réessayer » et le
 * tirer-pour-rafraîchir doivent RENDRE l'échec que le dépôt a constaté, au lieu de l'avaler.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsViewModelRefreshFailureTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun row(id: String) =
        ApiNotification(id = id, state = NotificationState(isRead = false, createdAt = "2026-11-17T00:00:00.000Z"))

    private fun offlineApi(): NotificationApi {
        val api: NotificationApi = mockk(relaxed = true)
        coEvery { api.list(any(), any(), any(), any()) } throws IOException("hors ligne")
        coEvery { api.unreadCount() } throws IOException("hors ligne")
        return api
    }

    private fun viewModel(api: NotificationApi): NotificationsViewModel {
        val performer: NotificationQuickActionPerformer = mockk(relaxed = true)
        every { performer.friendIds() } returns emptySet()
        return NotificationsViewModel(NotificationRepository(api), performer)
    }

    @Test
    fun `Reessayer apres une panne sans cache rend l'erreur au lieu de laisser le squelette`() = runTest {
        val vm = viewModel(offlineApi())
        advanceUntilIdle()
        assertThat(vm.state.value.loadDidFail).isTrue()

        vm.load()
        advanceUntilIdle()

        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.loadDidFail).isTrue()
    }

    @Test
    fun `un tirer-pour-rafraichir en echec leve pour que l'haptique d'erreur joue`() = runTest {
        val vm = viewModel(offlineApi())
        advanceUntilIdle()

        val outcome = runCatching { vm.pullRefresh() }

        assertThat(outcome.isFailure).isTrue()
    }

    @Test
    fun `un tirer-pour-rafraichir en echec laisse le cache affiche intact`() = runTest {
        val api = offlineApi()
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = listOf(row("a")))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 1)
        val vm = viewModel(api)
        advanceUntilIdle()
        coEvery { api.list(any(), any(), any(), any()) } throws IOException("hors ligne")

        runCatching { vm.pullRefresh() }

        assertThat(vm.state.value.notifications.map { it.id }).containsExactly("a")
    }

    @Test
    fun `un tirer-pour-rafraichir reussi ne leve pas`() = runTest {
        val api = offlineApi()
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = listOf(row("a")))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 1)
        val vm = viewModel(api)
        advanceUntilIdle()

        val outcome = runCatching { vm.pullRefresh() }

        assertThat(outcome.isSuccess).isTrue()
    }
}
