package me.meeshy.app.community

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.PagedResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityMembersViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val cache: CommunityCacheRepository = mockk(relaxed = true)
    private val repository: CommunityRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun member(user: String, role: String) = ApiCommunityMember(id = "m-$user", userId = user, role = role)

    private fun viewModel(meRole: String = "admin", members: List<ApiCommunityMember> = emptyList()): CommunityMembersViewModel {
        val all = members.ifEmpty { listOf(member("me", meRole), member("owner", "admin"), member("u1", "member"), member("u2", "moderator")) }
        every { session.currentUserId } returns "me"
        every { cache.detail("c1", any()) } returns flowOf(
            CacheResult.Fresh(ApiCommunity(id = "c1", createdBy = "owner", members = all), 0),
        )
        every { cache.members("c1", any()) } returns flowOf(CacheResult.Fresh(all, 0))
        return CommunityMembersViewModel(SavedStateHandle(mapOf("communityId" to "c1")), cache, repository, session)
    }

    @Test
    fun `members group by role, highest first, and an admin may manage others only`() = runTest {
        val vm = viewModel()

        assertThat(vm.state.value.sections.map { it.role }).containsExactly(MemberRole.ADMIN, MemberRole.MODERATOR, MemberRole.MEMBER).inOrder()
        val rows = vm.state.value.sections.flatMap { it.rows }.associateBy { it.member.userId }
        assertThat(rows.getValue("me").actions.isEmpty).isTrue()
        assertThat(rows.getValue("owner").actions.isEmpty).isTrue()
        assertThat(rows.getValue("u1").actions.canRemove).isTrue()
    }

    @Test
    fun `a plain member sees no management gesture and no invite`() = runTest {
        val vm = viewModel(meRole = "member")
        assertThat(vm.state.value.sections.flatMap { it.rows }.all { it.actions.isEmpty }).isTrue()
    }

    @Test
    fun `changing a role is optimistic then confirmed`() = runTest {
        val gate = CompletableDeferred<NetworkResult<ApiCommunityMember>>()
        coEvery { repository.updateMemberRole("c1", "m-u1", "moderator") } coAnswers { gate.await() }
        val vm = viewModel()
        val target = vm.state.value.sections.flatMap { it.rows }.first { it.member.userId == "u1" }.member

        vm.changeRole(target, MemberRole.MODERATOR)

        val moderators = vm.state.value.sections.first { it.role == MemberRole.MODERATOR }.rows.map { it.member.userId }
        assertThat(moderators).contains("u1")
        gate.complete(NetworkResult.Success(member("u1", "moderator")))
        coVerify { cache.refreshMembers("c1") }
    }

    @Test
    fun `a refused role change rolls back and says so`() = runTest {
        coEvery { repository.updateMemberRole(any(), any(), any()) } returns NetworkResult.Failure(ApiError("403"))
        val vm = viewModel()
        val target = vm.state.value.sections.flatMap { it.rows }.first { it.member.userId == "u1" }.member

        vm.changeRole(target, MemberRole.ADMIN)

        assertThat(vm.state.value.sections.first { it.role == MemberRole.MEMBER }.rows.map { it.member.userId }).contains("u1")
        assertThat(vm.effects.first()).isEqualTo(CommunityMembersEffect.ActionFailed)
    }

    @Test
    fun `removing a member hides the row at once and a refusal brings it back`() = runTest {
        val gate = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { repository.removeMember("c1", "u1") } coAnswers { gate.await() }
        val vm = viewModel()
        val target = vm.state.value.sections.flatMap { it.rows }.first { it.member.userId == "u1" }.member

        vm.remove(target)
        assertThat(vm.state.value.sections.flatMap { it.rows }.map { it.member.userId }).doesNotContain("u1")

        gate.complete(NetworkResult.Failure(ApiError("403")))
        assertThat(vm.state.value.sections.flatMap { it.rows }.map { it.member.userId }).contains("u1")
        assertThat(vm.effects.first()).isEqualTo(CommunityMembersEffect.ActionFailed)
    }

    @Test
    fun `a confirmed removal refreshes members, detail and list counters`() = runTest {
        coEvery { repository.removeMember("c1", "u1") } returns NetworkResult.Success(Unit)
        val vm = viewModel()
        vm.remove(vm.state.value.sections.flatMap { it.rows }.first { it.member.userId == "u1" }.member)

        coVerify { cache.refreshMembers("c1") }
        coVerify { cache.refreshDetail("c1") }
        coVerify { cache.refreshList() }
    }

    @Test
    fun `a full first page offers more and the next page appends`() = runTest {
        val page = (1..30).map { member("p$it", "member") } + member("me", "admin")
        val vm = viewModel(members = page)
        assertThat(vm.state.value.hasMore).isTrue()
        coEvery { repository.getMembersPaged("c1", 31, 30) } returns
            NetworkResult.Success(PagedResult(listOf(member("p31", "member")), Pagination(hasMore = false)))

        vm.loadMore()

        assertThat(vm.state.value.sections.flatMap { it.rows }.map { it.member.userId }).contains("p31")
        assertThat(vm.state.value.hasMore).isFalse()
    }
}
