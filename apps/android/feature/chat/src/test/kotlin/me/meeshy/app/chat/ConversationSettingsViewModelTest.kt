package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.UpdateConversationResponse
import me.meeshy.sdk.model.UpdateConversationSettingsRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
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

    private fun viewModel(repository: ConversationRepository) =
        ConversationSettingsViewModel(repository)

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
}
