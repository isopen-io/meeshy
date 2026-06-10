package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
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

    @Test
    fun `loads notifications on init`() = runTest {
        val items = listOf(notification("1"), notification("2"))
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Success(items)

        val vm = NotificationsViewModel(repository)

        assertThat(vm.state.value.notifications).hasSize(2)
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `markAsRead updates local state optimistically`() = runTest {
        val items = listOf(notification("n1", isRead = false))
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Success(items)

        val vm = NotificationsViewModel(repository)

        vm.markAsRead("n1")

        assertThat(vm.state.value.notifications.first().state.isRead).isTrue()
    }

    @Test
    fun `surfaces load error`() = runTest {
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Failure(ApiError("Server error", httpStatus = 500))

        val vm = NotificationsViewModel(repository)

        assertThat(vm.state.value.errorMessage).isEqualTo("Server error")
    }
}
