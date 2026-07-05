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
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.InMemoryThemeStore
import me.meeshy.sdk.theme.ThemeStore
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The appearance-preference wiring in [SettingsViewModel]: the persisted theme is
 * mirrored into the UI state and the two intents (pick a specific mode, cycle to the
 * next) drive the durable [ThemeStore].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelThemeTest {

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
        themeStore: ThemeStore = InMemoryThemeStore(),
        user: MeeshyUser? = null,
    ): SettingsViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(user)
        return SettingsViewModel(
            sessionRepository = session,
            userRepository = mockk<UserRepository>(relaxed = true),
            themeStore = themeStore,
            interfaceLanguageStore = InMemoryInterfaceLanguageStore(),
        )
    }

    @Test
    fun state_defaultsToAutoWhenNothingPersisted() = runTest(dispatcher) {
        val vm = vm()
        advanceUntilIdle()
        assertThat(vm.state.value.themeMode).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun state_reflectsThePersistedThemeOnStart() = runTest(dispatcher) {
        val vm = vm(themeStore = InMemoryThemeStore(AppThemeMode.DARK))
        advanceUntilIdle()
        assertThat(vm.state.value.themeMode).isEqualTo(AppThemeMode.DARK)
    }

    @Test
    fun setThemeMode_persistsAndSurfacesTheChoice() = runTest(dispatcher) {
        val store = InMemoryThemeStore()
        val vm = vm(themeStore = store)
        advanceUntilIdle()

        vm.setThemeMode(AppThemeMode.LIGHT)
        advanceUntilIdle()

        assertThat(store.themeMode.value).isEqualTo(AppThemeMode.LIGHT)
        assertThat(vm.state.value.themeMode).isEqualTo(AppThemeMode.LIGHT)
    }

    @Test
    fun cycleTheme_advancesAutoToLightToDarkAndWraps() = runTest(dispatcher) {
        val store = InMemoryThemeStore()
        val vm = vm(themeStore = store)
        advanceUntilIdle()

        vm.cycleTheme(); advanceUntilIdle()
        assertThat(store.themeMode.value).isEqualTo(AppThemeMode.LIGHT)

        vm.cycleTheme(); advanceUntilIdle()
        assertThat(store.themeMode.value).isEqualTo(AppThemeMode.DARK)

        vm.cycleTheme(); advanceUntilIdle()
        assertThat(store.themeMode.value).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun themeChanges_streamIntoTheState() = runTest(dispatcher) {
        val store = InMemoryThemeStore()
        val vm = vm(themeStore = store)
        advanceUntilIdle()

        vm.state.test {
            assertThat(awaitItem().themeMode).isEqualTo(AppThemeMode.AUTO)
            vm.setThemeMode(AppThemeMode.DARK)
            assertThat(awaitItem().themeMode).isEqualTo(AppThemeMode.DARK)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
