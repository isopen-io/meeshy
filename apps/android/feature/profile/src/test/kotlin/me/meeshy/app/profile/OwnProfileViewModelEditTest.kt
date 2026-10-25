package me.meeshy.app.profile

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
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.status.StatusBarCache
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
class OwnProfileViewModelEditTest {

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
        session: SessionRepository = mockk(relaxed = true),
        networkMonitor: NetworkMonitor = InMemoryNetworkMonitor(),
    ): OwnProfileViewModel {
        every { session.currentUser } returns flow
        return OwnProfileViewModel(
            sessionRepository = session,
            userRepository = userRepo,
            statsCache = coldStatsCache(),
            workManager = workManager,
            friendshipCache = FriendshipCache(),
            statusBarCache = StatusBarCache(SystemCacheClock),
            networkMonitor = networkMonitor,
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

        vm.onEvent(OwnProfileUiEvent.StartEditing)

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

        vm.onEvent(OwnProfileUiEvent.StartEditing)

        val s = vm.state.value
        assertThat(s.firstName).isEmpty()
        assertThat(s.lastName).isEmpty()
    }

    @Test
    fun nameIntents_updateTheEditorBuffers() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)

        vm.onEvent(OwnProfileUiEvent.FirstNameChanged("Alicia"))
        vm.onEvent(OwnProfileUiEvent.LastNameChanged("Keys"))

        val s = vm.state.value
        assertThat(s.firstName).isEqualTo("Alicia")
        assertThat(s.lastName).isEqualTo("Keys")
    }

    @Test
    fun contentLanguageIntents_updateTheEditorBuffers() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)

        vm.onEvent(OwnProfileUiEvent.SystemLanguageChanged("de"))
        vm.onEvent(OwnProfileUiEvent.RegionalLanguageChanged("it"))
        vm.onEvent(OwnProfileUiEvent.CustomDestinationLanguageChanged("pt"))

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
        vm.onEvent(OwnProfileUiEvent.StartEditing)

        vm.onEvent(OwnProfileUiEvent.Save)

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
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.FirstNameChanged("  Alicia  "))
        vm.onEvent(OwnProfileUiEvent.LastNameChanged("  Keys  "))
        vm.onEvent(OwnProfileUiEvent.DisplayNameChanged("  Alicia  "))
        vm.onEvent(OwnProfileUiEvent.SystemLanguageChanged("de"))

        vm.onEvent(OwnProfileUiEvent.Save)
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
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.BioChanged("new bio"))

        vm.onEvent(OwnProfileUiEvent.Save)
        advanceUntilIdle()

        coVerify(exactly = 1) { userRepo.enqueueProfileEdit(any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun saveProfile_reopensTheEditorAndSurfacesTheError_whenTheEnqueueThrows() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.enqueueProfileEdit(any()) } throws RuntimeException("db write failed")
        val session = mockk<SessionRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo, session = session)
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.DisplayNameChanged("Alicia"))

        vm.onEvent(OwnProfileUiEvent.Save)
        advanceUntilIdle()

        assertThat(vm.state.value.isEditing).isTrue()
        assertThat(vm.state.value.errorMessage).isEqualTo("db write failed")
        assertThat(vm.state.value.displayName).isEqualTo("Alicia")
        verify(exactly = 1) { session.restoreProfileSnapshot(user()) }
    }

    @Test
    fun cancelEditing_restoresTheBuffersFromTheCurrentUser() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.FirstNameChanged("Abandoned"))
        vm.onEvent(OwnProfileUiEvent.DisplayNameChanged("Typed but abandoned"))
        vm.onEvent(OwnProfileUiEvent.SystemLanguageChanged("de"))

        vm.onEvent(OwnProfileUiEvent.CancelEditing)

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
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.DisplayNameChanged("Alicia in progress"))

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

    @Test
    fun saveProfile_sendsOnlyTheChangedFields_andAnEmptyStringToClearTheBio() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val captured = slot<UpdateProfileRequest>()
        coEvery { userRepo.enqueueProfileEdit(capture(captured)) } returns "cmid_1"
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.BioChanged(""))
        vm.onEvent(OwnProfileUiEvent.CustomDestinationLanguageChanged(""))

        vm.onEvent(OwnProfileUiEvent.Save)
        advanceUntilIdle()

        assertThat(captured.captured).isEqualTo(UpdateProfileRequest(bio = "", customDestinationLanguage = ""))
    }

    @Test
    fun saveProfile_withNothingChanged_closesTheEditorWithoutQueueingAnything() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        val effects = mutableListOf<OwnProfileUiEffect>()
        backgroundScope.launch { vm.effects.toList(effects) }
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)

        vm.onEvent(OwnProfileUiEvent.Save)
        advanceUntilIdle()

        assertThat(vm.state.value.isEditing).isFalse()
        coVerify(exactly = 0) { userRepo.enqueueProfileEdit(any()) }
        assertThat(effects).containsExactly(OwnProfileUiEffect.SaveSucceeded)
    }

    @Test
    fun saveProfile_offline_playsTheSuccessHapticAndSaysItWillSyncLater() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.enqueueProfileEdit(any()) } returns "cmid_1"
        coEvery { userRepo.awaitProfileEditAbandoned("cmid_1") } coAnswers { CompletableDeferred<Boolean>().await() }
        val vm = ownProfileVm(
            MutableStateFlow(user()),
            userRepo,
            networkMonitor = InMemoryNetworkMonitor(initialOnline = false),
        )
        val effects = mutableListOf<OwnProfileUiEffect>()
        backgroundScope.launch { vm.effects.toList(effects) }
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.BioChanged("offline bio"))

        vm.onEvent(OwnProfileUiEvent.Save)
        advanceUntilIdle()

        assertThat(effects)
            .containsExactly(OwnProfileUiEffect.SaveSucceeded, OwnProfileUiEffect.SavedOffline)
            .inOrder()
    }

    @Test
    fun saveProfile_online_neverShowsTheOfflineToast() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.enqueueProfileEdit(any()) } returns "cmid_1"
        coEvery { userRepo.awaitProfileEditAbandoned("cmid_1") } returns false
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo)
        val effects = mutableListOf<OwnProfileUiEffect>()
        backgroundScope.launch { vm.effects.toList(effects) }
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.BioChanged("online bio"))

        vm.onEvent(OwnProfileUiEvent.Save)
        advanceUntilIdle()

        assertThat(effects).containsExactly(OwnProfileUiEffect.SaveSucceeded)
    }

    @Test
    fun anAbandonedEdit_restoresTheSnapshot_reopensTheEditor_andSaysTheError() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.enqueueProfileEdit(any()) } returns "cmid_1"
        coEvery { userRepo.awaitProfileEditAbandoned("cmid_1") } returns true
        val session = mockk<SessionRepository>(relaxed = true)
        val before = user()
        val vm = ownProfileVm(MutableStateFlow(before), userRepo, session = session)
        val effects = mutableListOf<OwnProfileUiEffect>()
        backgroundScope.launch { vm.effects.toList(effects) }
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.BioChanged(""))

        vm.onEvent(OwnProfileUiEvent.Save)
        advanceUntilIdle()

        verify(exactly = 1) { session.restoreProfileSnapshot(before) }
        assertThat(vm.state.value.isEditing).isTrue()
        assertThat(vm.state.value.bio).isEmpty()
        assertThat(effects).containsExactly(
            OwnProfileUiEffect.SaveSucceeded,
            OwnProfileUiEffect.SaveFailed(showDefaultMessage = true),
        ).inOrder()
    }

    @Test
    fun aDeliveredEdit_neverRollsBack() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.enqueueProfileEdit(any()) } returns "cmid_1"
        coEvery { userRepo.awaitProfileEditAbandoned("cmid_1") } returns false
        val session = mockk<SessionRepository>(relaxed = true)
        val vm = ownProfileVm(MutableStateFlow(user()), userRepo, session = session)
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)
        vm.onEvent(OwnProfileUiEvent.DisplayNameChanged("Alicia"))

        vm.onEvent(OwnProfileUiEvent.Save)
        advanceUntilIdle()

        verify(exactly = 0) { session.restoreProfileSnapshot(any()) }
        assertThat(vm.state.value.isEditing).isFalse()
    }

    @Test
    fun theBioIsCappedAtFiveHundredCharacters() = runTest(dispatcher) {
        val vm = ownProfileVm(MutableStateFlow(user()), mockk(relaxed = true))
        advanceUntilIdle()
        vm.onEvent(OwnProfileUiEvent.StartEditing)

        vm.onEvent(OwnProfileUiEvent.BioChanged("b".repeat(700)))

        assertThat(vm.state.value.bio).hasLength(500)
    }
}
