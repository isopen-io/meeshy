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
import me.meeshy.sdk.model.DndDay
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
 * The Do-Not-Disturb schedule wiring in [SettingsViewModel]: enable, start/end time and
 * per-day intents all drive the durable [NotificationPreferencesStore] through the pure
 * `DndWindow` helpers without clobbering the other notification toggles.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelDndTest {

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
    fun setDndEnabled_persistsAndSurfacesTheChoice() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setDndEnabled(true)
        advanceUntilIdle()

        assertThat(store.preferences.value.dndEnabled).isTrue()
        assertThat(vm.state.value.notifications.dndEnabled).isTrue()
    }

    @Test
    fun setDndStart_formatsThePickedTimeIntoTheStoredToken() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setDndStart(hour = 7, minute = 5)
        advanceUntilIdle()

        assertThat(store.preferences.value.dndStartTime).isEqualTo("07:05")
    }

    @Test
    fun setDndEnd_formatsThePickedTimeIntoTheStoredToken() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setDndEnd(hour = 23, minute = 30)
        advanceUntilIdle()

        assertThat(store.preferences.value.dndEndTime).isEqualTo("23:30")
    }

    @Test
    fun toggleDndDay_addsThenRemovesTheDay() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.toggleDndDay(DndDay.WED)
        advanceUntilIdle()
        assertThat(store.preferences.value.dndDays).containsExactly(DndDay.WED)

        vm.toggleDndDay(DndDay.WED)
        advanceUntilIdle()
        assertThat(store.preferences.value.dndDays).isEmpty()
    }

    @Test
    fun toggleDndDay_keepsCanonicalOrderAcrossSeveralDays() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.toggleDndDay(DndDay.FRI); advanceUntilIdle()
        vm.toggleDndDay(DndDay.MON); advanceUntilIdle()

        assertThat(store.preferences.value.dndDays)
            .containsExactly(DndDay.MON, DndDay.FRI).inOrder()
    }

    @Test
    fun dndIntents_doNotClobberOtherNotificationToggles() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore()
        val vm = vm(notificationStore = store)
        advanceUntilIdle()

        vm.setDndEnabled(true); advanceUntilIdle()
        vm.setDndStart(22, 0); advanceUntilIdle()
        vm.toggleDndDay(DndDay.SAT); advanceUntilIdle()

        val result = store.preferences.value
        assertThat(result.dndEnabled).isTrue()
        assertThat(result.dndStartTime).isEqualTo("22:00")
        assertThat(result.dndDays).containsExactly(DndDay.SAT)
        assertThat(result.pushEnabled).isTrue()
        assertThat(result.newMessageEnabled).isTrue()
        assertThat(result.dndEndTime).isEqualTo(UserNotificationPreferences().dndEndTime)
    }
}
