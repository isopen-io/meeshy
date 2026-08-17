package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: NotificationRepository = mockk(relaxed = true)

    private fun notification(id: String, isRead: Boolean = false) = ApiNotification(
        id = id,
        state = NotificationState(isRead = isRead, createdAt = "2024-01-01"),
    )

    private fun socketManager(events: MutableSharedFlow<ApiNotification> = MutableSharedFlow()): MessageSocketManager {
        val manager: MessageSocketManager = mockk(relaxed = true)
        every { manager.notificationReceived } returns events
        return manager
    }

    @Test
    fun `loads notifications on init`() = runTest {
        val items = listOf(notification("1"), notification("2"))
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Success(items)

        val vm = NotificationsViewModel(repository, socketManager())

        assertThat(vm.state.value.notifications).hasSize(2)
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `markAsRead updates local state optimistically`() = runTest {
        val items = listOf(notification("n1", isRead = false))
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Success(items)

        val vm = NotificationsViewModel(repository, socketManager())

        vm.markAsRead("n1")

        assertThat(vm.state.value.notifications.first().state.isRead).isTrue()
    }

    @Test
    fun `surfaces load error`() = runTest {
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Failure(ApiError("Server error", httpStatus = 500))

        val vm = NotificationsViewModel(repository, socketManager())

        assertThat(vm.state.value.errorMessage).isEqualTo("Server error")
    }

    @Test
    fun `a real-time notification is prepended to the list and bumps the unread count`() = runTest {
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Success(listOf(notification("old")))
        val events = MutableSharedFlow<ApiNotification>()
        val vm = NotificationsViewModel(repository, socketManager(events))

        events.emit(notification("fresh", isRead = false))

        assertThat(vm.state.value.notifications.map { it.id }).containsExactly("fresh", "old").inOrder()
        assertThat(vm.state.value.unreadCount).isEqualTo(1)
    }

    @Test
    fun `a real-time notification that arrives already read does not bump the unread count`() = runTest {
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Success(emptyList())
        val events = MutableSharedFlow<ApiNotification>()
        val vm = NotificationsViewModel(repository, socketManager(events))

        events.emit(notification("fresh", isRead = true))

        assertThat(vm.state.value.unreadCount).isEqualTo(0)
    }

    @Test
    fun `a duplicate real-time delivery of an already-known id is a no-op`() = runTest {
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Success(listOf(notification("n1")))
        val events = MutableSharedFlow<ApiNotification>()
        val vm = NotificationsViewModel(repository, socketManager(events))

        events.emit(notification("n1", isRead = false))

        assertThat(vm.state.value.notifications).hasSize(1)
        assertThat(vm.state.value.unreadCount).isEqualTo(0)
    }
}
