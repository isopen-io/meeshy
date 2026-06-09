package me.meeshy.app.notifications

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
import org.junit.Test

class NotificationsViewModelTest {

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
        vm.state.test {
            skipItems(1) // loading state
            val s = awaitItem()
            assertThat(s.notifications).hasSize(2)
            assertThat(s.isLoading).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `markAsRead updates local state optimistically`() = runTest {
        val items = listOf(notification("n1", isRead = false))
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Success(items)

        val vm = NotificationsViewModel(repository)
        vm.state.test {
            skipItems(2) // loading + loaded
            vm.markAsRead("n1")
            val s = awaitItem()
            assertThat(s.notifications.first().state.isRead).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `surfaces load error`() = runTest {
        coEvery { repository.list(any(), any(), any()) } returns NetworkResult.Failure(ApiError("Server error", httpStatus = 500))

        val vm = NotificationsViewModel(repository)
        vm.state.test {
            skipItems(1)
            val s = awaitItem()
            assertThat(s.errorMessage).isEqualTo("Server error")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
