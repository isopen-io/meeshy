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
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationMetadata
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationConsumptionService
import me.meeshy.sdk.notification.NotificationDeletedSocketEvent
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.LocalDateTime

/**
 * « Un Sang s'approche » (#20540), app ouverte et dans la cloche : la ligne et le bandeau ouvrent la carte de l'autre Sang,
 * et le même événement livré deux fois (socket puis rejeu) ne pose qu'un bandeau.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BloodProximityNotificationRoutingTest {

    private val dispatcher = StandardTestDispatcher()
    private val received = MutableSharedFlow<ApiNotification>(extraBufferCapacity = 16)
    private val socket = mockk<MessageSocketManager> {
        every { notificationReceived } returns received
        every { notificationDeleted } returns MutableSharedFlow<NotificationDeletedSocketEvent>()
    }
    private val conversations = mockk<ConversationRepository>(relaxed = true).also {
        every { it.conversationStream(any()) } returns flowOf(null)
    }
    private val clock = object : NotificationToastClock {
        var millis = 0L
        override fun nowMillis(): Long = millis
        override fun localDateTime(): LocalDateTime = LocalDateTime.of(2026, 11, 24, 12, 0)
    }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun proximity(id: String = "n1", userId: String? = "u-lina") = ApiNotification(
        id = id,
        type = "blood_proximity",
        title = "Lina est tout près",
        content = "À 500 m — touche pour vous voir tous les deux sur la carte",
        actor = NotificationActor(id = "u-lina", displayName = "Lina"),
        metadata = NotificationMetadata(action = "view_profile", userId = userId, distanceMeters = 500),
    )

    private fun viewModel(preferences: UserNotificationPreferences = UserNotificationPreferences()) = NotificationBannerViewModel(
        messageSocketManager = socket,
        preferencesStore = InMemoryNotificationPreferencesStore(preferences),
        conversationRepository = conversations,
        clock = clock,
        activeConversationStore = ActiveConversationStore(),
        consumption = mockk<NotificationConsumptionService>(relaxed = true),
    )

    @Test
    fun `la ligne de la cloche ouvre la carte de l autre Sang`() {
        assertThat(NotificationDestinationResolver.resolve(proximity()))
            .isEqualTo(NotificationDestination.PersonMap("u-lina"))
    }

    @Test
    fun `une ligne sans userId ouvre la carte de l acteur`() {
        assertThat(NotificationDestinationResolver.resolve(proximity(userId = null)))
            .isEqualTo(NotificationDestination.PersonMap("u-lina"))
    }

    @Test
    fun `l hote qui ne sait pas ouvrir de carte retombe sur le profil`() {
        var opened: String? = null
        NotificationDestination.PersonMap("u-lina").dispatch({}, {}, {}, {}, onOpenProfile = { opened = it })

        assertThat(opened).isEqualTo("u-lina")
    }

    @Test
    fun `le bandeau in-app s ouvre sur la carte`() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()

        received.emit(proximity())
        runCurrent()

        val banner = vm.banner.value
        assertThat(banner?.personMapUserId).isEqualTo("u-lina")
        assertThat(banner?.tapTarget()).isEqualTo(BannerTap.PersonMap("u-lina"))
        assertThat(banner?.presentation?.body).isEqualTo("À 500 m — touche pour vous voir tous les deux sur la carte")
    }

    @Test
    fun `le meme evenement livre deux fois ne pose qu un bandeau`() = runTest(dispatcher.scheduler) {
        val vm = viewModel()
        runCurrent()
        received.emit(proximity(id = "n1"))
        runCurrent()
        vm.dismiss()

        clock.millis = 500
        received.emit(proximity(id = "n1"))
        runCurrent()

        assertThat(vm.banner.value).isNull()
        advanceTimeBy(10)
    }

    @Test
    fun `la preference coupee ne pose aucun bandeau`() = runTest(dispatcher.scheduler) {
        val vm = viewModel(UserNotificationPreferences(bloodProximityEnabled = false))
        runCurrent()

        received.emit(proximity())
        runCurrent()

        assertThat(vm.banner.value).isNull()
    }
}
