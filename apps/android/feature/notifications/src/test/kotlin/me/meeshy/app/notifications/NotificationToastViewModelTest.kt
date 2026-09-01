package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationContext
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The in-app toast orchestrator (feature-parity §M): drives [ToastDedupWindow] +
 * [NotificationToastPolicy] off the socket seam. The pure gate is tested exhaustively in
 * `NotificationToastPolicyTest`/`ToastDedupWindowTest`; here we prove the STATEFUL wiring — the
 * 2 s dedup window, the 7 s auto-dismiss and its cancellation, and the active-screen hooks.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationToastViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private val received = MutableSharedFlow<ApiNotification>(extraBufferCapacity = 16)
    private val socket = mockk<MessageSocketManager> {
        every { notificationReceived } returns received
    }

    private class FakeClock(
        var millis: Long = 0,
    ) : NotificationToastClock {
        override fun nowMillis(): Long = millis
    }

    private val clock = FakeClock()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun notification(
        id: String = "n1",
        type: String = "new_message",
        conversationId: String? = "c1",
        postId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
        context = NotificationContext(conversationId = conversationId, postId = postId),
    )

    private fun viewModel(
        preferences: UserNotificationPreferences = UserNotificationPreferences(),
    ) = NotificationToastViewModel(
        messageSocketManager = socket,
        notificationPreferencesStore = InMemoryNotificationPreferencesStore(preferences),
        clock = clock,
    )

    @Test
    fun aFreshNotificationSurfacesAsAToast() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()

        assertThat(vm.currentToast.value?.id).isEqualTo("n1")
    }

    @Test
    fun aDuplicateDeliveryWithinTheWindowDoesNotSurfaceAgain() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()
        vm.dismiss()

        clock.millis = 500
        received.emit(notification(id = "n1"))
        runCurrent()

        assertThat(vm.currentToast.value).isNull()
    }

    @Test
    fun theSameIdAfterTheDedupWindowSurfacesAgain() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()
        vm.dismiss()

        clock.millis = 2_000
        received.emit(notification(id = "n1"))
        runCurrent()

        assertThat(vm.currentToast.value?.id).isEqualTo("n1")
    }

    @Test
    fun aNotificationForTheOpenConversationIsSuppressed() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()
        vm.onConversationOpened("c1")

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        assertThat(vm.currentToast.value).isNull()
    }

    @Test
    fun pushDisabledDoesNotSuppressTheInAppToast() = runTest(dispatcher.scheduler) {
        // iOS `allowsInAppBanner` ignores the push master: a user with the app open still sees
        // in-app toasts for enabled types. Push/DND gate the foreground push banner, not this.
        val vm = viewModel(UserNotificationPreferences(pushEnabled = false))
        runCurrent()

        received.emit(notification(id = "n1", type = "new_message"))
        runCurrent()

        assertThat(vm.currentToast.value?.id).isEqualTo("n1")
    }

    @Test
    fun aTypeWhosePerTypeToggleIsOffIsSuppressed() = runTest(dispatcher.scheduler) {
        val vm = viewModel(UserNotificationPreferences(newMessageEnabled = false))
        runCurrent()

        received.emit(notification(id = "n1", type = "new_message"))
        runCurrent()

        assertThat(vm.currentToast.value).isNull()
    }

    @Test
    fun aShownToastAutoDismissesAfterSevenSeconds() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()
        assertThat(vm.currentToast.value?.id).isEqualTo("n1")

        advanceUntilIdle()

        assertThat(vm.currentToast.value).isNull()
    }

    @Test
    fun anOlderToastsTimerDoesNotDismissANewerToast() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        clock.millis = 0
        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        advanceTimeBy(3_000)
        clock.millis = 3_000
        received.emit(notification(id = "n2", conversationId = "c2"))
        runCurrent()

        // Past n1's 7 s (7_001) but well inside n2's (only 4_001 elapsed): n2 must still stand.
        advanceTimeBy(4_001)

        assertThat(vm.currentToast.value?.id).isEqualTo("n2")
    }

    @Test
    fun openingTheConversationDismissesItsShownToast() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()
        assertThat(vm.currentToast.value?.id).isEqualTo("n1")

        vm.onConversationOpened("c1")

        assertThat(vm.currentToast.value).isNull()
    }

    @Test
    fun openingADifferentConversationLeavesTheToastStanding() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        vm.onConversationOpened("c2")

        assertThat(vm.currentToast.value?.id).isEqualTo("n1")
    }

    @Test
    fun openingThePostDismissesItsShownToast() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = null, postId = "p1"))
        runCurrent()
        assertThat(vm.currentToast.value?.id).isEqualTo("n1")

        vm.onPostOpened("p1")

        assertThat(vm.currentToast.value).isNull()
    }

    @Test
    fun aNotificationForTheOpenPostIsSuppressed() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()
        vm.onPostOpened("p1")

        received.emit(notification(id = "n1", conversationId = null, postId = "p1"))
        runCurrent()

        assertThat(vm.currentToast.value).isNull()
    }

    @Test
    fun closingTheConversationReopensTheSuppression() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()
        vm.onConversationOpened("c1")
        vm.onConversationClosed()

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        assertThat(vm.currentToast.value?.id).isEqualTo("n1")
    }

    @Test
    fun dismissClearsTheCurrentToast() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()
        assertThat(vm.currentToast.value?.id).isEqualTo("n1")

        vm.dismiss()

        assertThat(vm.currentToast.value).isNull()
    }
}
