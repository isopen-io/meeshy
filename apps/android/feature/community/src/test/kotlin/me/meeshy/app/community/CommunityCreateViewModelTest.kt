package me.meeshy.app.community

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.community.CommunityAppearanceStore
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.IdentifierAvailability
import me.meeshy.sdk.model.IdentifierCheck
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityCreateViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repository: CommunityRepository = mockk(relaxed = true)
    private val cache: CommunityCacheRepository = mockk(relaxed = true)
    private val users: UserRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val appearance: CommunityAppearanceStore = mockk(relaxed = true)

    private fun viewModel(): CommunityCreateViewModel {
        every { session.currentUserId } returns "me"
        return CommunityCreateViewModel(repository, cache, users, session, appearance)
    }

    private fun user(id: String) = UserSearchResult(id = id, username = id)

    @Test
    fun `a blank name cannot be submitted`() = runTest {
        val vm = viewModel()
        vm.onName("   ")
        vm.create()

        assertThat(vm.state.value.canSubmit).isFalse()
        coVerify(exactly = 0) { repository.create(any(), any(), any(), any()) }
    }

    @Test
    fun `the accent follows the name and is New while empty`() = runTest {
        val vm = viewModel()
        val empty = vm.state.value.accentHex
        vm.onName("Club")
        assertThat(vm.state.value.accentHex).isNotEmpty()
        assertThat(empty).isNotEmpty()
    }

    @Test
    fun `creating sends the trimmed request then adds the chosen members and the local emoji`() = runTest {
        coEvery { repository.create("Club", "mon-club", "Hello", false) } returns NetworkResult.Success(ApiCommunity(id = "c9", name = "Club"))
        coEvery { repository.addMember("c9", any(), any()) } returns NetworkResult.Success(ApiCommunityMember(id = "m", userId = "u1"))
        val vm = viewModel()
        vm.onName(" Club ")
        vm.onIdentifier("mon-club")
        vm.onDescription(" Hello ")
        vm.onPrivate(false)
        vm.onEmoji("🚀")
        vm.toggleMember(user("u1"))
        vm.toggleMember(user("u2"))

        vm.create()

        assertThat(vm.effects.first()).isEqualTo(CommunityCreateEffect.Created("c9"))
        coVerify { repository.addMember("c9", "u1", any()) }
        coVerify { repository.addMember("c9", "u2", any()) }
        coVerify { appearance.setEmoji("c9", "🚀") }
        coVerify { cache.refreshList() }
        assertThat(vm.state.value.isCreating).isFalse()
    }

    @Test
    fun `a refused creation shows the server message and creates nothing else`() = runTest {
        coEvery { repository.create(any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("Identifier taken"))
        val vm = viewModel()
        vm.onName("Club")

        vm.create()

        assertThat(vm.state.value.errorMessage).isEqualTo("Identifier taken")
        assertThat(vm.state.value.isCreating).isFalse()
        coVerify(exactly = 0) { repository.addMember(any(), any(), any()) }

        vm.dismissError()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `a failing member add does not undo the community`() = runTest {
        coEvery { repository.create(any(), any(), any(), any()) } returns NetworkResult.Success(ApiCommunity(id = "c9"))
        coEvery { repository.addMember(any(), any(), any()) } returns NetworkResult.Failure(ApiError("403"))
        val vm = viewModel()
        vm.onName("Club")
        vm.toggleMember(user("u1"))

        vm.create()

        assertThat(vm.effects.first()).isEqualTo(CommunityCreateEffect.Created("c9"))
    }

    @Test
    fun `member search waits for two characters, debounces and leaves yourself out`() = runTest {
        coEvery { users.searchUsers("al", 10, 0) } returns NetworkResult.Success(listOf(user("me"), user("al1")))
        val vm = viewModel()

        vm.onMemberQuery("a")
        dispatcher.scheduler.advanceUntilIdle()
        coVerify(exactly = 0) { users.searchUsers(any(), any(), any()) }

        vm.onMemberQuery("al")
        assertThat(vm.state.value.isSearching).isTrue()
        dispatcher.scheduler.advanceUntilIdle()

        assertThat(vm.state.value.results.map { it.id }).containsExactly("al1")
        assertThat(vm.state.value.isSearching).isFalse()
    }

    @Test
    fun `choosing a member twice removes it from the draft and the chips`() = runTest {
        val vm = viewModel()
        vm.toggleMember(user("u1"))
        assertThat(vm.state.value.selected.map { it.id }).containsExactly("u1")
        assertThat(vm.state.value.draft.memberIds).containsExactly("u1")

        vm.toggleMember(user("u1"))
        assertThat(vm.state.value.selected).isEmpty()
        assertThat(vm.state.value.draft.memberIds).isEmpty()
    }

    @Test
    fun `an unavailable identifier is flagged after the debounce and blocks the creation`() = runTest {
        coEvery { repository.checkIdentifier("mshy_club") } returns NetworkResult.Success(IdentifierAvailability(available = false, identifier = "mshy_club"))
        val vm = viewModel()
        vm.onName("Club")
        vm.onIdentifier("Club")

        assertThat(vm.state.value.identifierCheck).isEqualTo(IdentifierCheck.Checking)
        coVerify(exactly = 0) { repository.checkIdentifier(any()) }
        dispatcher.scheduler.advanceUntilIdle()

        assertThat(vm.state.value.identifierCheck).isEqualTo(IdentifierCheck.Unavailable)
        assertThat(vm.state.value.canSubmit).isFalse()
        vm.create()
        coVerify(exactly = 0) { repository.create(any(), any(), any(), any()) }
    }

    @Test
    fun `an available identifier lets the creation through and clearing it resets the check`() = runTest {
        coEvery { repository.checkIdentifier(any()) } returns NetworkResult.Success(IdentifierAvailability(available = true))
        val vm = viewModel()
        vm.onName("Club")
        vm.onIdentifier("club")
        dispatcher.scheduler.advanceUntilIdle()
        assertThat(vm.state.value.identifierCheck).isEqualTo(IdentifierCheck.Available)
        assertThat(vm.state.value.canSubmit).isTrue()

        vm.onIdentifier("")
        assertThat(vm.state.value.identifierCheck).isEqualTo(IdentifierCheck.Idle)
    }

    @Test
    fun `a second submission while creating is ignored`() = runTest {
        coEvery { repository.create(any(), any(), any(), any()) } coAnswers { kotlinx.coroutines.awaitCancellation() }
        val vm = viewModel()
        vm.onName("Club")

        vm.create()
        vm.create()

        coVerify(exactly = 1) { repository.create(any(), any(), any(), any()) }
        assertThat(vm.state.value.isCreating).isTrue()
    }
}
