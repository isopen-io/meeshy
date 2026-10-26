package me.meeshy.app.community

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityInviteViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repository: CommunityRepository = mockk(relaxed = true)
    private val cache: CommunityCacheRepository = mockk(relaxed = true)
    private val users: UserRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun user(id: String) = UserSearchResult(id = id, username = id)

    private fun viewModel(): CommunityInviteViewModel {
        every { session.currentUserId } returns "me"
        return CommunityInviteViewModel(SavedStateHandle(mapOf("communityId" to "c1")), repository, cache, users, session)
    }

    @Test
    fun `search waits for two characters and leaves the reader out`() = runTest {
        coEvery { users.searchUsers("al", 20, 0) } returns NetworkResult.Success(listOf(user("me"), user("al1")))
        val vm = viewModel()
        vm.onQuery("a")
        dispatcher.scheduler.advanceUntilIdle()
        coVerify(exactly = 0) { users.searchUsers(any(), any(), any()) }

        vm.onQuery("al")
        dispatcher.scheduler.advanceUntilIdle()

        assertThat(vm.state.value.results.map { it.id }).containsExactly("al1")
        assertThat(vm.state.value.showsNoResults).isFalse()
    }

    @Test
    fun `an empty answer is the no-results state`() = runTest {
        coEvery { users.searchUsers(any(), any(), any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.onQuery("zz")
        dispatcher.scheduler.advanceUntilIdle()
        assertThat(vm.state.value.showsNoResults).isTrue()
    }

    @Test
    fun `inviting marks the person invited once and refreshes the members`() = runTest {
        coEvery { repository.invite("c1", "u1") } returns NetworkResult.Success(ApiCommunityMember(id = "m", userId = "u1"))
        val vm = viewModel()

        vm.invite(user("u1"))
        vm.invite(user("u1"))

        assertThat(vm.effects.first()).isEqualTo(CommunityInviteEffect.Invited)
        assertThat(vm.state.value.invitedIds).containsExactly("u1")
        assertThat(vm.state.value.recentlyInvited.map { it.id }).containsExactly("u1")
        coVerify(exactly = 1) { repository.invite("c1", "u1") }
        coVerify { cache.refreshMembers("c1") }
    }

    @Test
    fun `a refused invitation leaves the person invitable and reports`() = runTest {
        coEvery { repository.invite(any(), any()) } returns NetworkResult.Failure(ApiError("403"))
        val vm = viewModel()

        vm.invite(user("u1"))

        assertThat(vm.effects.first()).isEqualTo(CommunityInviteEffect.Failed)
        assertThat(vm.state.value.invitedIds).isEmpty()
        assertThat(vm.state.value.invitingId).isNull()
    }
}
