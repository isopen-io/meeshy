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
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.InMemoryThemeStore
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.OffsetDateTime

/** A quiet-hours edit records the device's UTC offset so the gateway reads the window in LOCAL time. */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelDndOffsetTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(store: InMemoryNotificationPreferencesStore): SettingsViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        return SettingsViewModel(
            sessionRepository = session,
            userRepository = mockk<UserRepository>(relaxed = true),
            themeStore = InMemoryThemeStore(),
            interfaceLanguageStore = InMemoryInterfaceLanguageStore(),
            notificationPreferencesStore = store,
            notificationPreferencesSyncRepository = mockk(relaxed = true),
            workManager = mockk(relaxed = true),
        )
    }

    private fun deviceOffset(): Int = (OffsetDateTime.now().offset.totalSeconds / 60).coerceIn(-720, 840)

    @Test
    fun `chaque edition des heures calmes enregistre le decalage de l appareil`() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore(UserNotificationPreferences(dndUtcOffsetMinutes = 999))
        val vm = vm(store)
        advanceUntilIdle()

        vm.toggleDndDay(DndDay.MON)
        advanceUntilIdle()

        assertThat(store.preferences.value.dndUtcOffsetMinutes).isEqualTo(deviceOffset())
        assertThat(store.preferences.value.dndDays).containsExactly(DndDay.MON)
    }

    @Test
    fun `une bascule hors heures calmes ne touche pas au decalage`() = runTest(dispatcher) {
        val store = InMemoryNotificationPreferencesStore(UserNotificationPreferences(dndUtcOffsetMinutes = 999))
        val vm = vm(store)
        advanceUntilIdle()

        vm.setNotificationBadgeEnabled(false)
        advanceUntilIdle()

        assertThat(store.preferences.value.dndUtcOffsetMinutes).isEqualTo(999)
    }
}
