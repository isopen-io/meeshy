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
import me.meeshy.sdk.language.InterfaceLanguageStore
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.InMemoryThemeStore
import me.meeshy.sdk.theme.ThemeStore
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The interface-language-preference wiring in [SettingsViewModel]: the persisted UI
 * language (a supported code, or `null` = System/follow device) is mirrored into the UI
 * state and the pick intent drives the durable [InterfaceLanguageStore].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelLanguageTest {

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
        languageStore: InterfaceLanguageStore = InMemoryInterfaceLanguageStore(),
        themeStore: ThemeStore = InMemoryThemeStore(),
        user: MeeshyUser? = null,
    ): SettingsViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(user)
        return SettingsViewModel(
            sessionRepository = session,
            userRepository = mockk<UserRepository>(relaxed = true),
            themeStore = themeStore,
            interfaceLanguageStore = languageStore,
        )
    }

    @Test
    fun state_defaultsToSystemWhenNothingPersisted() = runTest(dispatcher) {
        val vm = vm()
        advanceUntilIdle()
        assertThat(vm.state.value.interfaceLanguage).isNull()
    }

    @Test
    fun state_reflectsThePersistedLanguageOnStart() = runTest(dispatcher) {
        val vm = vm(languageStore = InMemoryInterfaceLanguageStore("es"))
        advanceUntilIdle()
        assertThat(vm.state.value.interfaceLanguage).isEqualTo("es")
    }

    @Test
    fun setInterfaceLanguage_persistsAndSurfacesTheChoice() = runTest(dispatcher) {
        val store = InMemoryInterfaceLanguageStore()
        val vm = vm(languageStore = store)
        advanceUntilIdle()

        vm.setInterfaceLanguage("fr")
        advanceUntilIdle()

        assertThat(store.languageCode.value).isEqualTo("fr")
        assertThat(vm.state.value.interfaceLanguage).isEqualTo("fr")
    }

    @Test
    fun setInterfaceLanguage_null_returnsToSystem() = runTest(dispatcher) {
        val store = InMemoryInterfaceLanguageStore("ar")
        val vm = vm(languageStore = store)
        advanceUntilIdle()
        assertThat(vm.state.value.interfaceLanguage).isEqualTo("ar")

        vm.setInterfaceLanguage(null)
        advanceUntilIdle()

        assertThat(store.languageCode.value).isNull()
        assertThat(vm.state.value.interfaceLanguage).isNull()
    }

    @Test
    fun languageChanges_streamIntoTheState() = runTest(dispatcher) {
        val store = InMemoryInterfaceLanguageStore()
        val vm = vm(languageStore = store)
        advanceUntilIdle()

        vm.state.test {
            assertThat(awaitItem().interfaceLanguage).isNull()
            vm.setInterfaceLanguage("es")
            assertThat(awaitItem().interfaceLanguage).isEqualTo("es")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
