package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationContext
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.sdk.model.NotificationReadScope
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationConsumptionEvents
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.notification.NotificationScopePage
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Sous une catégorie, les lignes servies par la passerelle au-delà de la première page vivent dans la copie PROPRE de
 * l'écran : un « lu » ou une suppression venus du socket, d'un autre appareil ou de l'ouverture d'une conversation
 * ne passent que par les canaux de consommation, et l'écran doit s'y repeindre.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsViewModelConsumptionTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val consumption = NotificationConsumptionEvents()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun row(id: String, conversationId: String? = null, type: String = "friend_request", isRead: Boolean = false) =
        ApiNotification(
            id = id,
            type = type,
            state = NotificationState(isRead = isRead, createdAt = "2026-11-17T00:00:00.000Z"),
            context = conversationId?.let { NotificationContext(conversationId = it) },
        )

    /** Le cache « all » ne contient RIEN : toutes les lignes ne vivent que dans la page de la catégorie. */
    private fun repository(served: NetworkResult<NotificationScopePage>): NotificationRepository {
        val repository: NotificationRepository = mockk(relaxed = true)
        every { repository.notificationsStream(any(), any()) } returns MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        every { repository.unreadCountStream } returns MutableStateFlow(0)
        every { repository.hasMoreStream } returns MutableStateFlow(false)
        every { repository.cachedItems(any()) } returns null
        coEvery { repository.refresh() } returns null
        coEvery { repository.listScopePage(any(), any(), any(), any()) } returns served
        return repository
    }

    private fun served(vararg rows: ApiNotification): NetworkResult<NotificationScopePage> =
        NetworkResult.Success(NotificationScopePage(rows.toList(), hasMore = false, nextCursor = null))

    private fun viewModel(repository: NotificationRepository): NotificationsViewModel {
        val performer: NotificationQuickActionPerformer = mockk(relaxed = true)
        every { performer.friendIds() } returns emptySet()
        return NotificationsViewModel(repository, performer, consumption)
    }

    private fun NotificationsViewModel.shown() = state.value.filteredNotifications.map { it.id }

    @Test
    fun `un lu venu du socket retire de la puce Non lues la ligne qu'elle seule porte`() = runTest {
        val vm = viewModel(repository(served(row("x"), row("y"))))
        vm.selectCategory(NotificationFilterCategory.UNREAD)
        assertThat(vm.shown()).containsExactly("x", "y")

        consumption.publishRead(NotificationReadScope.Single("x"))

        assertThat(vm.shown()).containsExactly("y")
    }

    @Test
    fun `l'ouverture ailleurs d'une conversation lit les lignes de cette conversation sous la categorie`() = runTest {
        val vm = viewModel(repository(served(row("x", conversationId = "conv-x"), row("y", conversationId = "conv-y"))))
        vm.selectCategory(NotificationFilterCategory.UNREAD)

        consumption.publishRead(NotificationReadScope.Conversation("conv-y"))

        assertThat(vm.shown()).containsExactly("x")
    }

    @Test
    fun `une lecture par types et une lecture de toute la boite repeignent aussi la categorie`() = runTest {
        val vm = viewModel(repository(served(row("a", type = "friend_request"), row("b", type = "contact_joined"))))
        vm.selectCategory(NotificationFilterCategory.UNREAD)

        consumption.publishRead(NotificationReadScope.Types(listOf("friend_request")))
        assertThat(vm.shown()).containsExactly("b")

        consumption.publishRead(NotificationReadScope.All)
        assertThat(vm.shown()).isEmpty()
    }

    @Test
    fun `une suppression venue d'ailleurs retire la ligne servie par la categorie`() = runTest {
        val vm = viewModel(repository(served(row("x"), row("y"))))
        vm.selectCategory(NotificationFilterCategory.UNREAD)

        consumption.publishDeleted("y")

        assertThat(vm.shown()).containsExactly("x")
    }

    @Test
    fun `un lu refuse par le serveur relit la page de la categorie au lieu de remettre non lu a l'aveugle`() = runTest {
        val repository = repository(served(row("x"), row("y")))
        val vm = viewModel(repository)
        vm.selectCategory(NotificationFilterCategory.UNREAD)
        consumption.publishRead(NotificationReadScope.Single("x"))
        assertThat(vm.shown()).containsExactly("y")

        consumption.publishRolledBack(NotificationReadScope.Single("x"))

        assertThat(vm.shown()).containsExactly("x", "y")
        coVerify(exactly = 2) { repository.listScopePage(any(), any(), any(), any()) }
    }

    @Test
    fun `sous la liste complete un refus de lecture ne relit aucune categorie`() = runTest {
        val repository = repository(served(row("x")))
        viewModel(repository)

        consumption.publishRolledBack(NotificationReadScope.Single("x"))

        coVerify(exactly = 0) { repository.listScopePage(any(), any(), any(), any()) }
    }

    @Test
    fun `un lu et une suppression venus pendant le chargement de la categorie survivent a la page qui arrive`() = runTest {
        val repository = repository(served())
        val gate = CompletableDeferred<NetworkResult<NotificationScopePage>>()
        coEvery { repository.listScopePage(any(), any(), any(), any()) } coAnswers { gate.await() }
        val vm = viewModel(repository)
        vm.selectCategory(NotificationFilterCategory.UNREAD)

        consumption.publishRead(NotificationReadScope.Single("x"))
        consumption.publishDeleted("z")
        gate.complete(served(row("x"), row("y"), row("z")))
        advanceUntilIdle()

        assertThat(vm.shown()).containsExactly("y")
    }
}
