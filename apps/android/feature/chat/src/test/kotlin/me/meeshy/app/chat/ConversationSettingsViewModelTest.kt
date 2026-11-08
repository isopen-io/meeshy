package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ConversationAppearance
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.UpdateConversationResponse
import me.meeshy.sdk.model.UpdateConversationSettingsRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationSettingsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun conversation(
        id: String = "c1",
        writeRole: String? = "member",
        announcement: Boolean = false,
        slowMode: Int? = 0,
        autoTranslate: Boolean? = false,
    ) = ApiConversation(
        id = id,
        defaultWriteRole = writeRole,
        isAnnouncementChannel = announcement,
        slowModeSeconds = slowMode,
        autoTranslateEnabled = autoTranslate,
    )

    private fun repo(
        conversation: ApiConversation? = conversation(),
        updateResult: NetworkResult<UpdateConversationResponse> =
            NetworkResult.Success(UpdateConversationResponse(id = "c1")),
    ): ConversationRepository {
        val repository = mockk<ConversationRepository>(relaxed = true)
        coEvery { repository.conversationStream(any()) } returns flowOf(conversation)
        coEvery { repository.updateSettings(any(), any()) } returns updateResult
        return repository
    }

    private fun session(user: MeeshyUser?): SessionRepository = mockk<SessionRepository>(relaxed = true).also {
        every { it.currentUser } returns MutableStateFlow(user)
    }

    private fun loader(): AppearanceCatalogLoader = mockk<AppearanceCatalogLoader>(relaxed = true).also {
        every { it.current } returns AppearanceCatalog.EMPTY
        coEvery { it.catalog() } returns AppearanceCatalog.EMPTY
    }

    private fun viewModel(repository: ConversationRepository, user: MeeshyUser? = MeeshyUser(id = "me", username = "me")) =
        ConversationSettingsViewModel(repository, session(user), loader())

    @Test
    fun `load seeds a clean form from the cached conversation`() = runTest {
        val vm = viewModel(repo(conversation(writeRole = "admin", slowMode = 30)))

        vm.load("c1")
        advanceUntilIdle()

        val form = vm.state.value.form
        assertThat(vm.state.value.isLoaded).isTrue()
        assertThat(form?.writeRole).isEqualTo(MemberRole.ADMIN)
        assertThat(form?.slowModeSeconds).isEqualTo(30)
        assertThat(vm.state.value.canSave).isFalse()
    }

    @Test
    fun `editing a control marks the form saveable without persisting yet`() = runTest {
        val vm = viewModel(repo())

        vm.load("c1")
        advanceUntilIdle()
        vm.setAnnouncement(true)

        assertThat(vm.state.value.form?.isAnnouncementChannel).isTrue()
        assertThat(vm.state.value.canSave).isTrue()
        assertThat(vm.state.value.status).isEqualTo(SettingsSaveStatus.Idle)
    }

    @Test
    fun `save persists only the changed fields and re-baselines on success`() = runTest {
        val repository = repo()
        val vm = viewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        vm.setWriteRole(MemberRole.ADMIN)
        vm.setSlowMode(60)
        vm.save()
        advanceUntilIdle()

        val expected = UpdateConversationSettingsRequest(defaultWriteRole = "admin", slowModeSeconds = 60)
        io.mockk.coVerify { repository.updateSettings("c1", expected) }
        assertThat(vm.state.value.justSaved).isTrue()
        assertThat(vm.state.value.canSave).isFalse()
        assertThat(vm.state.value.form?.isDirty).isFalse()
    }

    @Test
    fun `save on a clean form is a no-op and never hits the network`() = runTest {
        val repository = repo()
        val vm = viewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        vm.save()
        advanceUntilIdle()

        io.mockk.coVerify(exactly = 0) { repository.updateSettings(any(), any()) }
        assertThat(vm.state.value.status).isEqualTo(SettingsSaveStatus.Idle)
    }

    @Test
    fun `a failed save preserves the edits and surfaces an error`() = runTest {
        val repository = repo(
            updateResult = NetworkResult.Failure(ApiError(message = "Forbidden", code = "HTTP_403")),
        )
        val vm = viewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        vm.setSlowMode(300)
        vm.save()
        advanceUntilIdle()

        assertThat(vm.state.value.hasError).isTrue()
        assertThat(vm.state.value.form?.slowModeSeconds).isEqualTo(300)
        assertThat(vm.state.value.form?.isDirty).isTrue()
        assertThat(vm.state.value.canSave).isTrue()
    }

    @Test
    fun `editing after a failed save clears the error banner`() = runTest {
        val repository = repo(
            updateResult = NetworkResult.Failure(ApiError(message = "Forbidden")),
        )
        val vm = viewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        vm.setSlowMode(300)
        vm.save()
        advanceUntilIdle()
        assertThat(vm.state.value.hasError).isTrue()

        vm.setAutoTranslate(true)

        assertThat(vm.state.value.status).isEqualTo(SettingsSaveStatus.Idle)
    }

    @Test
    fun `load ignores later stream emissions so in-progress edits are not clobbered`() = runTest {
        val repository = mockk<ConversationRepository>(relaxed = true)
        coEvery { repository.conversationStream("c1") } returns
            flowOf(conversation(announcement = false), conversation(announcement = true))
        val vm = viewModel(repository)

        vm.load("c1")
        advanceUntilIdle()

        // Seeded from the FIRST emission; the second (announcement=true) must not overwrite the form.
        assertThat(vm.state.value.form?.isAnnouncementChannel).isFalse()
    }

    private fun ranked(type: String, role: String?) = conversation().copy(type = type, currentUserRole = role)

    @Test
    fun `a group moderator may edit the conversation`() = runTest {
        val vm = viewModel(repo(ranked("group", "moderator")))
        vm.load("c1")
        advanceUntilIdle()
        assertThat(vm.state.value.mayEdit).isTrue()
    }

    @Test
    fun `a group member may not edit the conversation`() = runTest {
        val vm = viewModel(repo(ranked("group", "member")))
        vm.load("c1")
        advanceUntilIdle()
        assertThat(vm.state.value.mayEdit).isFalse()
    }

    @Test
    fun `nobody edits Global or a direct, whatever the rank`() = runTest {
        listOf("global", "direct").forEach { type ->
            val vm = viewModel(repo(ranked(type, "creator")))
            vm.load("c1")
            advanceUntilIdle()
            assertThat(vm.state.value.mayEdit).isFalse()
        }
    }

    @Test
    fun `setAccent writes the personal accent through the optimistic mutation`() = runTest {
        val repository = repo()
        coEvery { repository.setAppearanceOptimistic(any(), any()) } returns true
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.setAccent("coral")
        advanceUntilIdle()

        io.mockk.coVerify { repository.setAppearanceOptimistic("c1", ConversationAppearance.DEFAULT.withAccent("coral")) }
        assertThat(vm.state.value.appearance.accent).isEqualTo("coral")
    }

    @Test
    fun `setAccent returns to the previous choice when the write is refused`() = runTest {
        val repository = repo()
        coEvery { repository.setAppearanceOptimistic(any(), any()) } returns false
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.setAccent("coral")
        advanceUntilIdle()

        assertThat(vm.state.value.appearance.accent).isNull()
    }

    @Test
    fun `setAccent with the current choice writes nothing`() = runTest {
        val repository = repo()
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.setAccent(null)
        advanceUntilIdle()

        io.mockk.coVerify(exactly = 0) { repository.setAppearanceOptimistic(any(), any()) }
    }

    @Test
    fun `member search is local and starts empty`() = runTest {
        val vm = viewModel(repo())
        vm.load("c1")
        advanceUntilIdle()
        assertThat(vm.state.value.memberQuery).isEmpty()

        vm.setMemberQuery("ali")

        assertThat(vm.state.value.memberQuery).isEqualTo("ali")
    }

    @Test
    fun `the add member button follows the viewer rank`() = runTest {
        suspend fun mayAdd(role: String): Boolean {
            val vm = viewModel(repo(ApiConversation(id = "c1", currentUserRole = role)))
            vm.load("c1")
            advanceUntilIdle()
            return vm.state.value.mayAddMember
        }

        assertThat(mayAdd("member")).isFalse()
        assertThat(mayAdd("moderator")).isTrue()
        assertThat(mayAdd("admin")).isTrue()
    }
}
