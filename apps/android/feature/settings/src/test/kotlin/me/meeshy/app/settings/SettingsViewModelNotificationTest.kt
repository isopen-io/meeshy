package me.meeshy.app.settings

import app.cash.turbine.test
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
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.InMemoryThemeStore
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The notification-preference wiring in [SettingsViewModel]: the persisted block is
 * mirrored into the UI state and each per-toggle intent drives the durable
 * [NotificationPreferencesStore] without clobbering the other toggles.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelNotificationTest {

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
        )
    }

    @Test
    fun state_defaultsToTheDefaultBlockWhenNothingPersisted() = runTest(dispatcher) {
        val vm = vm()
        advanceUntilIdle()
        assertThat(vm.state.value.notifications).isEqualTo(UserNotificationPreferences())
    }

    @Test
    fun state_reflectsThePersistedBlockOnStart() = runTest(dispatcher) {
        val seed = UserNotificationPreferences(pushEnabled = false, soundEnabled = false)
        val vm = vm(notificationStore = InMemoryNotificationPreferencesStore(seed))
        advanceUntilIdle()
        assertThat(vm.state.value.notifications).isEqualTo(seed)
    }

    @Test
    fun setPushEnabled_persistsAndSurfacesTheChoice() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setPushEnabled(false)
        advanceUntilIdle()

        assertThat(store.preferences.value.pushEnabled).isFalse()
        assertThat(vm.state.value.notifications.pushEnabled).isFalse()
    }

    @Test
    fun setSoundEnabled_persistsWithoutTouchingOtherToggles() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setSoundEnabled(false)
        advanceUntilIdle()

        assertThat(store.preferences.value.soundEnabled).isFalse()
        assertThat(store.preferences.value.pushEnabled).isTrue()
        assertThat(store.preferences.value.vibrationEnabled).isTrue()
    }

    @Test
    fun setVibrationEnabled_persists() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setVibrationEnabled(false)
        advanceUntilIdle()

        assertThat(store.preferences.value.vibrationEnabled).isFalse()
    }

    @Test
    fun setNewMessageEnabled_persists() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setNewMessageEnabled(false)
        advanceUntilIdle()

        assertThat(store.preferences.value.newMessageEnabled).isFalse()
    }

    @Test
    fun successiveToggles_composeWithoutClobberingEachOther() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setPushEnabled(false); advanceUntilIdle()
        vm.setSoundEnabled(false); advanceUntilIdle()
        vm.setVibrationEnabled(false); advanceUntilIdle()

        val result = store.preferences.value
        assertThat(result.pushEnabled).isFalse()
        assertThat(result.soundEnabled).isFalse()
        assertThat(result.vibrationEnabled).isFalse()
        assertThat(result.newMessageEnabled).isTrue()
    }

    @Test
    fun toggleChanges_streamIntoTheState() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.state.test {
            assertThat(awaitItem().notifications.pushEnabled).isTrue()
            vm.setPushEnabled(false)
            assertThat(awaitItem().notifications.pushEnabled).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
