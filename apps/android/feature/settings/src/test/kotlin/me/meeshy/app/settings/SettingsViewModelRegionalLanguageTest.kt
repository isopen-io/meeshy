package me.meeshy.app.settings

import androidx.work.WorkManager
import androidx.work.WorkRequest
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
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
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.InMemoryThemeStore
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The regional (secondary content) language wiring in [SettingsViewModel]. Unlike the
 * interface language (a device-local UI-chrome store), the regional language is a Prisme
 * *content* preference living on the backend profile: the picked code flows through the
 * optimistic + offline-queued profile-edit path ([UserRepository.enqueueProfileEdit]) and
 * the current value is mirrored from the session identity. The picker's search query is
 * UI-only and never triggers a write.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelRegionalLanguageTest {

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
        userRepository: UserRepository = mockk(relaxed = true),
        workManager: WorkManager = mockk(relaxed = true),
        user: MeeshyUser? = null,
    ): SettingsViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(user)
        return SettingsViewModel(
            sessionRepository = session,
            userRepository = userRepository,
            themeStore = InMemoryThemeStore(),
            interfaceLanguageStore = InMemoryInterfaceLanguageStore(),
            notificationPreferencesStore = InMemoryNotificationPreferencesStore(),
            notificationPreferencesSyncRepository = mockk(relaxed = true),
            workManager = workManager,
        )
    }

    private fun user(system: String? = null, regional: String? = null): MeeshyUser =
        MeeshyUser(
            id = "u1",
            username = "alice",
            systemLanguage = system,
            regionalLanguage = regional,
        )

    @Test
    fun state_mirrorsTheSessionRegionalAndSystemLanguages() = runTest(dispatcher) {
        val vm = vm(user = user(system = "fr", regional = "es"))
        advanceUntilIdle()

        assertThat(vm.state.value.regionalLanguage).isEqualTo("es")
        assertThat(vm.state.value.systemLanguage).isEqualTo("fr")
    }

    @Test
    fun state_hasNoRegionalLanguageWhenSignedOut() = runTest(dispatcher) {
        val vm = vm(user = null)
        advanceUntilIdle()

        assertThat(vm.state.value.regionalLanguage).isNull()
        assertThat(vm.state.value.systemLanguage).isNull()
    }

    @Test
    fun setRegionalLanguage_queuesTheProfileEditAndWakesTheWorker() = runTest(dispatcher) {
        val userRepository = mockk<UserRepository>()
        val request = slot<UpdateProfileRequest>()
        coEvery { userRepository.enqueueProfileEdit(capture(request)) } returns "cmid_1"
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(userRepository = userRepository, workManager = workManager, user = user(system = "fr"))
        advanceUntilIdle()

        vm.setRegionalLanguage("es")
        advanceUntilIdle()

        coVerify(exactly = 1) { userRepository.enqueueProfileEdit(any()) }
        assertThat(request.captured.regionalLanguage).isEqualTo("es")
        // it edits ONLY the regional language — the other content-language fields stay absent
        assertThat(request.captured.systemLanguage).isNull()
        assertThat(request.captured.customDestinationLanguage).isNull()
        assertThat(request.captured.displayName).isNull()
        verify(exactly = 1) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun setRegionalLanguage_doesNotWakeTheWorkerWhenTheEnqueueIsInert() = runTest(dispatcher) {
        val userRepository = mockk<UserRepository>()
        // null cmid = no active session / superseded — nothing to flush.
        coEvery { userRepository.enqueueProfileEdit(any()) } returns null
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(userRepository = userRepository, workManager = workManager)
        advanceUntilIdle()

        vm.setRegionalLanguage("es")
        advanceUntilIdle()

        coVerify(exactly = 1) { userRepository.enqueueProfileEdit(any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun setRegionalLanguageQuery_isUiOnlyAndNeverWrites() = runTest(dispatcher) {
        val userRepository = mockk<UserRepository>(relaxed = true)
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(userRepository = userRepository, workManager = workManager)
        advanceUntilIdle()

        vm.setRegionalLanguageQuery("span")
        advanceUntilIdle()

        assertThat(vm.state.value.regionalLanguageQuery).isEqualTo("span")
        coVerify(exactly = 0) { userRepository.enqueueProfileEdit(any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun anOptimisticSessionRepaint_streamsTheNewRegionalLanguageIntoTheState() = runTest(dispatcher) {
        val session = mockk<SessionRepository>()
        val currentUser = MutableStateFlow<MeeshyUser?>(user(system = "fr", regional = null))
        every { session.currentUser } returns currentUser
        val vm = SettingsViewModel(
            sessionRepository = session,
            userRepository = mockk(relaxed = true),
            themeStore = InMemoryThemeStore(),
            interfaceLanguageStore = InMemoryInterfaceLanguageStore(),
            notificationPreferencesStore = InMemoryNotificationPreferencesStore(),
            notificationPreferencesSyncRepository = mockk(relaxed = true),
            workManager = mockk(relaxed = true),
        )
        advanceUntilIdle()

        vm.state.test {
            assertThat(awaitItem().regionalLanguage).isNull()
            // the profile-edit path optimistically republishes the session identity
            currentUser.value = user(system = "fr", regional = "es")
            assertThat(awaitItem().regionalLanguage).isEqualTo("es")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
