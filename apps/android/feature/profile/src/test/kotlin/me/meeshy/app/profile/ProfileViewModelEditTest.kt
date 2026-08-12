package me.meeshy.app.profile

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import androidx.work.WorkRequest
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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Optimistic + offline-queued profile editing (ARCHITECTURE.md §4/§5). The editor
 * closes instantly on save, the durable enqueue drives the write (the flush worker
 * is woken only when a row was actually queued), and the editor buffers are seeded
 * from — and never clobbered by — the session identity.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelEditTest {

    private val dispatcher = StandardTestDispatcher()

    private fun user(
        id: String = "u1",
        firstName: String? = "Alice",
        lastName: String? = "Liddell",
        displayName: String? = "Alice",
        bio: String? = "hi",
        systemLanguage: String? = "fr",
        regionalLanguage: String? = "en",
        customDestinationLanguage: String? = "es",
    ) = MeeshyUser(
        id = id,
        username = "alice",
        firstName = firstName,
        lastName = lastName,
        displayName = displayName,
        bio = bio,
        systemLanguage = systemLanguage,
        regionalLanguage = regionalLanguage,
        customDestinationLanguage = customDestinationLanguage,
    )

    private fun coldStatsCache(): ProfileStatsCacheRepository {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats(any()) } returns null
        coEvery { cache.cachedTimeline() } returns null
        return cache
    }

    private fun ownProfileVm(
        flow: MutableStateFlow<MeeshyUser?>,
        userRepo: UserRepository,
        workManager: WorkManager = mockk(relaxed = true),
    ): ProfileViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns flow
        return ProfileViewModel(
            sessionRepository = session,
            userRepository = userRepo,
            statsCache = coldStatsCache(),
            workManager = workManager,
            savedStateHandle = SavedStateHandle(),
        )
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun startEditing_seedsEveryEditorBufferFromTheCurrentUser() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val flow = MutableStateFlow<MeeshyUser?>(user())
        val vm = ownProfileVm(flow, userRepo)
        advanceUntilIdle()

        vm.startEditing()

        val s = vm.state.value
        assertThat(s.isEditing).isTrue()
        assertThat(s.firstName).isEqualTo("Alice")
        assertThat(s.lastName).isEqualTo("Liddell")
        assertThat(s.displayName).isEqualTo("Alice")
        assertThat(s.bio).isEqualTo("hi")
        assertThat(s.systemLanguage).isEqualTo("fr")
        assertThat(s.regionalLanguage).isEqualTo("en")
        assertThat(s.customDestinationLanguage).isEqualTo("es")
    }

    @Test
    fun startEditing_seedsBlankNameBuffers_whenTheUserHasNoNames() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val flow = MutableStateFlow<MeeshyUser?>(user(firstName = null, lastName = null))
        val vm = ownProfileVm(flow, userRepo)
        advanceUntilIdle()

        vm.startEditing()

        val s = vm.state.value
        assertThat(s.firstName).isEmpty()
        assertThat(s.lastName).isEmpty()
    }

    @Test
    fun nameIntents_updateTheEditorBuffers() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.startEditing()

        vm.onFirstNameChange("Alicia")
        vm.onLastNameChange("Keys")

        val s = vm.state.value
        assertThat(s.firstName).isEqualTo("Alicia")
        assertThat(s.lastName).isEqualTo("Keys")
    }

    @Test
    fun contentLanguageIntents_updateTheEditorBuffers() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.startEditing()

        vm.onSystemLanguageChange("de")
        vm.onRegionalLanguageChange("it")
        vm.onCustomDestinationLanguageChange("pt")

        val s = vm.state.value
        assertThat(s.systemLanguage).isEqualTo("de")
        assertThat(s.regionalLanguage).isEqualTo("it")
        assertThat(s.customDestinationLanguage).isEqualTo("pt")
    }

    @Test
    fun saveProfile_closesTheEditorImmediately() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.enqueueProfileEdit(any()) } returns "cmid_1"
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.startEditing()

        vm.saveProfile()

        // Optimistic: the editor closes before the coroutine (and network) run.
        assertThat(vm.state.value.isEditing).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun saveProfile_enqueuesTheEditedRequestAndWakesTheWorker() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        val captured = slot<UpdateProfileRequest>()
        coEvery { userRepo.enqueueProfileEdit(capture(captured)) } returns "cmid_1"
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo, workManager)
        advanceUntilIdle()
        vm.startEditing()
        vm.onFirstNameChange("  Alicia  ")
        vm.onLastNameChange("  Keys  ")
        vm.onDisplayNameChange("  Alicia  ")
        vm.onSystemLanguageChange("de")

        vm.saveProfile()
        advanceUntilIdle()

        // The request is built from the buffers via the trimming builder.
        assertThat(captured.captured.firstName).isEqualTo("Alicia")
        assertThat(captured.captured.lastName).isEqualTo("Keys")
        assertThat(captured.captured.displayName).isEqualTo("Alicia")
        assertThat(captured.captured.systemLanguage).isEqualTo("de")
        coVerify(exactly = 1) { userRepo.enqueueProfileEdit(any()) }
        verify(exactly = 1) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun saveProfile_doesNotWakeTheWorker_whenTheEnqueueWasSuperseded() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        // null cmid = superseded / no active session — nothing to flush.
        coEvery { userRepo.enqueueProfileEdit(any()) } returns null
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo, workManager)
        advanceUntilIdle()
        vm.startEditing()

        vm.saveProfile()
        advanceUntilIdle()

        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun saveProfile_reopensTheEditorAndSurfacesTheError_whenTheEnqueueThrows() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.enqueueProfileEdit(any()) } throws RuntimeException("db write failed")
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.startEditing()

        vm.saveProfile()
        advanceUntilIdle()

        assertThat(vm.state.value.isEditing).isTrue()
        assertThat(vm.state.value.errorMessage).isEqualTo("db write failed")
    }

    @Test
    fun cancelEditing_restoresTheBuffersFromTheCurrentUser() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.startEditing()
        vm.onFirstNameChange("Abandoned")
        vm.onDisplayNameChange("Typed but abandoned")
        vm.onSystemLanguageChange("de")

        vm.cancelEditing()

        val s = vm.state.value
        assertThat(s.isEditing).isFalse()
        assertThat(s.firstName).isEqualTo("Alice")
        assertThat(s.displayName).isEqualTo("Alice")
        assertThat(s.systemLanguage).isEqualTo("fr")
    }

    @Test
    fun aBackgroundSessionEmissionWhileEditing_doesNotClobberTheEditorBuffers() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val flow = MutableStateFlow<MeeshyUser?>(user())
        val vm = ownProfileVm(flow, userRepo)
        advanceUntilIdle()
        vm.startEditing()
        vm.onDisplayNameChange("Alicia in progress")

        // A background refresh republishes a different identity mid-edit.
        flow.value = user(displayName = "Server Renamed")
        advanceUntilIdle()

        // The editor buffer is preserved; only the read-only reference advances.
        assertThat(vm.state.value.displayName).isEqualTo("Alicia in progress")
        assertThat(vm.state.value.user?.displayName).isEqualTo("Server Renamed")
    }

    @Test
    fun whileNotEditing_aSessionEmissionSyncsTheBuffers() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val flow = MutableStateFlow<MeeshyUser?>(user())
        val vm = ownProfileVm(flow, userRepo)
        advanceUntilIdle()

        flow.value = user(displayName = "Renamed", systemLanguage = "de")
        advanceUntilIdle()

        assertThat(vm.state.value.displayName).isEqualTo("Renamed")
        assertThat(vm.state.value.systemLanguage).isEqualTo("de")
    }
}
