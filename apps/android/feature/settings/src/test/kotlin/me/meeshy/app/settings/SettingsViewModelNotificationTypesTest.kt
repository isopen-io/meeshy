package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.language.InMemoryInterfaceLanguageStore
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.NotificationType
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.InMemoryThemeStore
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The per-event notification-type wiring in [SettingsViewModel]: each type toggle drives the
 * durable [NotificationPreferencesStore] through the pure `NotificationTypeCatalog` lens without
 * clobbering the other toggles, and the search query is held in the UI state.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelNotificationTypesTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(
        notificationStore: NotificationPreferencesStore = InMemoryNotificationPreferencesStore(),
        user: MeeshyUser? = null,
    ): SettingsViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(user)
        return SettingsViewModel(
            sessionRepository = session,
            userRepository = mockk<UserRepository>(relaxed = true),
            themeStore = InMemoryThemeStore(),
            interfaceLanguageStore = InMemoryInterfaceLanguageStore(),
            notificationPreferencesStore = notificationStore,
            notificationPreferencesSyncRepository = mockk(relaxed = true),
            workManager = mockk(relaxed = true),
        )
    }

    @Test
    fun setNotificationTypeEnabled_persistsAndSurfacesTheChoice() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setNotificationTypeEnabled(NotificationType.MENTION, enabled = false)
        advanceUntilIdle()

        assertThat(store.preferences.value.mentionEnabled).isFalse()
        assertThat(vm.state.value.notifications.mentionEnabled).isFalse()
    }

    @Test
    fun setNotificationTypeEnabled_doesNotClobberOtherToggles() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setNotificationTypeEnabled(NotificationType.POST_LIKE, enabled = false)
        advanceUntilIdle()

        val result = store.preferences.value
        assertThat(result.postLikeEnabled).isFalse()
        assertThat(result.reactionEnabled).isTrue()
        assertThat(result.pushEnabled).isTrue()
        assertThat(result.newMessageEnabled).isTrue()
    }

    @Test
    fun setNotificationTypeEnabled_canReEnableAPreviouslyOffType() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setNotificationTypeEnabled(NotificationType.MEMBER_LEFT, enabled = true)
        advanceUntilIdle()

        assertThat(store.preferences.value.memberLeftEnabled).isTrue()
    }

    @Test
    fun setNotificationTypeQuery_updatesTheUiStateOnly() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setNotificationTypeQuery("react")
        advanceUntilIdle()

        assertThat(vm.state.value.notificationTypeQuery).isEqualTo("react")
        // The query is a view concern — it must not mutate the persisted block.
        assertThat(store.preferences.value.reactionEnabled).isTrue()
    }
}
