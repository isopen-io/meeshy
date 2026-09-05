package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.BannerHeadline
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationContext
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.LocalDateTime

/**
 * The live in-app banner orchestrator (feature-parity §M). Its dedup is now the SHARED pure
 * [me.meeshy.sdk.model.ToastDedupWindow] (tested exhaustively in `ToastDedupWindowTest`) instead
 * of a private re-implementation, and its clock is the injected [NotificationToastClock] seam —
 * so this proves the STATEFUL wiring: the 2 s dedup window, the active-screen suppression, the
 * push/DND gate, the navigation payload, and the auto-dismiss + its cancellation. Mirrors the
 * `NotificationToastViewModelTest` harness (same socket + clock seams) — the two orchestrators
 * are now consistent by construction.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationBannerViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private val received = MutableSharedFlow<ApiNotification>(extraBufferCapacity = 16)
    private val socket = mockk<MessageSocketManager> {
        every { notificationReceived } returns received
    }

    private val conversationRepository = mockk<ConversationRepository>(relaxed = true).also {
        every { it.conversationStream(any()) } returns flowOf(null)
    }

    private class FakeClock(
        var millis: Long = 0,
        var local: LocalDateTime = LocalDateTime.of(2026, 8, 31, 12, 0),
    ) : NotificationToastClock {
        override fun nowMillis(): Long = millis
        override fun localDateTime(): LocalDateTime = local
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
    ) = NotificationBannerViewModel(
        messageSocketManager = socket,
        preferencesStore = InMemoryNotificationPreferencesStore(preferences),
        conversationRepository = conversationRepository,
        clock = clock,
        activeConversationStore = ActiveConversationStore(),
    )

    @Test
    fun aFreshNotificationSurfacesAsABanner() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()

        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")
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

        assertThat(vm.banner.value).isNull()
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

        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")
    }

    @Test
    fun aNotificationForTheOpenConversationIsSuppressed() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()
        vm.setActiveContext(conversationId = "c1", postId = null)

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        assertThat(vm.banner.value).isNull()
    }

    @Test
    fun aNotificationForADifferentConversationStillSurfaces() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()
        vm.setActiveContext(conversationId = "c2", postId = null)

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")
    }

    @Test
    fun aNotificationForTheOpenPostIsSuppressed() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()
        vm.setActiveContext(conversationId = null, postId = "p1")

        received.emit(notification(id = "n1", conversationId = null, postId = "p1"))
        runCurrent()

        assertThat(vm.banner.value).isNull()
    }

    @Test
    fun pushDisabledSuppressesTheBanner() = runTest(dispatcher.scheduler) {
        val vm = viewModel(UserNotificationPreferences(pushEnabled = false))
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()

        assertThat(vm.banner.value).isNull()
    }

    @Test
    fun theBannerCarriesTheConversationIdForNavigation() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = "c1", postId = null))
        runCurrent()

        assertThat(vm.banner.value?.conversationId).isEqualTo("c1")
        assertThat(vm.banner.value?.postId).isNull()
    }

    @Test
    fun theBannerCarriesThePostIdForNavigation() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = null, postId = "p1"))
        runCurrent()

        assertThat(vm.banner.value?.postId).isEqualTo("p1")
        assertThat(vm.banner.value?.conversationId).isNull()
    }

    @Test
    fun aShownBannerAutoDismissesAfterFourSeconds() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()
        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")

        advanceUntilIdle()

        assertThat(vm.banner.value).isNull()
    }

    @Test
    fun anOlderBannersTimerDoesNotDismissANewerBanner() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        clock.millis = 0
        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        advanceTimeBy(3_000)
        clock.millis = 3_000
        received.emit(notification(id = "n2", conversationId = "c2"))
        runCurrent()

        // Past n1's 4 s (4_001) but well inside n2's (only 1_001 elapsed): n2 must still stand.
        advanceTimeBy(1_001)

        assertThat(vm.banner.value?.notificationId).isEqualTo("n2")
    }

    @Test
    fun openingTheShownBannersConversationDismissesIt() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()
        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")

        vm.setActiveContext(conversationId = "c1", postId = null)

        assertThat(vm.banner.value).isNull()
    }

    @Test
    fun openingADifferentConversationLeavesTheShownBanner() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        vm.setActiveContext(conversationId = "c2", postId = null)

        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")
    }

    @Test
    fun openingTheShownBannersPostDismissesIt() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = null, postId = "p1"))
        runCurrent()
        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")

        vm.setActiveContext(conversationId = null, postId = "p1")

        assertThat(vm.banner.value).isNull()
    }

    @Test
    fun leavingAllScreensDoesNotDismissAShownBanner() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1", conversationId = "c1"))
        runCurrent()

        vm.setActiveContext(conversationId = null, postId = null)

        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")
    }

    @Test
    fun settingActiveContextWithNoBannerShownIsInert() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        vm.setActiveContext(conversationId = "c1", postId = null)

        assertThat(vm.banner.value).isNull()
    }

    @Test
    fun theGroupBannerLeadsTheLocalNameWithItsFavoriteEmoji() = runTest(dispatcher.scheduler) {
        // The local rename + favorite emoji live only on the device (iOS composedSubtitle):
        // the banner headline must read "<actor> dans <emoji> <renamed name>", not the bare title.
        every { conversationRepository.conversationStream("c1") } returns flowOf(
            ApiConversation(
                id = "c1",
                type = "group",
                title = "Équipe Tech",
                preferences = ApiConversationPreferences(
                    customName = "Mon équipe à moi",
                    reaction = "😴",
                ),
            ),
        )
        val vm = viewModel()
        runCurrent()

        received.emit(
            ApiNotification(
                id = "n1",
                type = "new_message",
                actor = NotificationActor(id = "a1", displayName = "Alice"),
                context = NotificationContext(conversationId = "c1", conversationType = "group"),
            ),
        )
        runCurrent()

        val headline = vm.banner.value?.presentation?.headline
        assertThat(headline).isInstanceOf(BannerHeadline.InConversation::class.java)
        val inConversation = headline as BannerHeadline.InConversation
        assertThat(inConversation.actor).isEqualTo("Alice")
        assertThat(inConversation.groupName).isEqualTo("😴 Mon équipe à moi")
    }

    @Test
    fun showPreviewOffHidesTheBannerContent() = runTest(dispatcher.scheduler) {
        val vm = viewModel(UserNotificationPreferences(showPreview = false))
        runCurrent()

        received.emit(
            ApiNotification(
                id = "n1",
                type = "new_message",
                actor = NotificationActor(id = "a1", displayName = "Alice"),
                content = "Dinner at 8?",
                context = NotificationContext(conversationId = "c1"),
            ),
        )
        runCurrent()

        val banner = vm.banner.value
        assertThat(banner?.previewHidden).isTrue()
        assertThat(banner?.presentation?.body).isNull()
    }

    @Test
    fun showPreviewOnLeavesTheBannerContentVisible() = runTest(dispatcher.scheduler) {
        val vm = viewModel(UserNotificationPreferences(showPreview = true))
        runCurrent()

        received.emit(
            ApiNotification(
                id = "n1",
                type = "new_message",
                actor = NotificationActor(id = "a1", displayName = "Alice"),
                content = "Dinner at 8?",
                context = NotificationContext(conversationId = "c1"),
            ),
        )
        runCurrent()

        val banner = vm.banner.value
        assertThat(banner?.previewHidden).isFalse()
        assertThat(banner?.presentation?.body).isEqualTo("Dinner at 8?")
    }

    @Test
    fun dismissClearsTheCurrentBanner() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(notification(id = "n1"))
        runCurrent()
        assertThat(vm.banner.value?.notificationId).isEqualTo("n1")

        vm.dismiss()

        assertThat(vm.banner.value).isNull()
    }
}
